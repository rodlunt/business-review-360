/**
 * Webhooks router
 *
 * Issue #572 -- restore the Resend webhook receiver dropped during the
 * SendGrid decommission. EmailLog rows were landing as `sent` and never
 * progressing through the delivery / open / click / bounce lifecycle, which
 * left the analytics dashboard from #448 with no engagement data to render.
 *
 * Design notes:
 *
 *   - Resend signs webhooks with the Svix scheme. Header set is
 *     `svix-id`, `svix-timestamp`, `svix-signature`. The signature payload
 *     is `${svix-id}.${svix-timestamp}.${rawBody}` with HMAC-SHA256 keyed by
 *     a base64-decoded secret. The header may carry several space-separated
 *     versioned signatures (`v1,<sig> v1,<sig2>`); any match is accepted.
 *
 *   - We intentionally do NOT pull in the `svix` npm package. The
 *     verification surface is roughly thirty lines of Node `crypto`, and the
 *     project convention is to avoid new dependencies without a clear need.
 *     The Stripe webhook already uses `stripe.webhooks.constructEvent` --
 *     that is the only place we accept a vendored verifier, because the
 *     Stripe SDK is already a dependency for the billing flow.
 *
 *   - HMAC verification needs the RAW request body. The router exports the
 *     handler factory and a path constant; `index.js` mounts it with
 *     `express.raw({ type: 'application/json' })` BEFORE the global
 *     `express.json()` parser, mirroring the Stripe webhook pattern.
 *
 *   - Replay protection: any timestamp older than ~5 minutes (or more than
 *     5 minutes in the future, allowing for clock skew) is rejected. This is
 *     the Svix recommendation.
 *
 *   - Unknown messageId is treated as 200 OK with a logged miss. Resend
 *     sends test events from the dashboard that have no matching EmailLog
 *     row; failing them as 4xx would cause Resend to retry and eventually
 *     disable the endpoint.
 *
 *   - Idempotency: we do not deduplicate by `svix-id`. Resend's at-least-once
 *     delivery means duplicate `email.opened` events would inflate
 *     `openCount`. A small in-memory or Redis-backed cache could fix this,
 *     but neither is portable to Azure Container Apps without extra moving
 *     parts (the BR360 portability principle). The chosen approach: rely on
 *     Resend's built-in dedup window and accept that openCount is a "lower
 *     bound on opens", not a strict count. Documented here so a future
 *     contributor does not assume otherwise.
 */

import express from "express";
import crypto from "crypto";
import { createLogger } from "../utils/logger.js";
import EmailLog from "../models/EmailLog.js";

const router = express.Router();

// Tolerance window for replay protection. Five minutes either side of the
// signed timestamp matches Svix's documented default.
const REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verify a Resend (Svix) webhook signature.
 *
 * @param {object} args
 * @param {string} args.secret - Webhook signing secret. Resend prefixes the
 *   secret with `whsec_`; the actual key material is base64-encoded. We
 *   accept either the full `whsec_...` string or just the base64 portion.
 * @param {string} args.svixId - `svix-id` header value.
 * @param {string} args.svixTimestamp - `svix-timestamp` header value (unix seconds).
 * @param {string} args.svixSignature - `svix-signature` header value. May
 *   contain multiple space-separated `v1,<sig>` entries.
 * @param {Buffer|string} args.rawBody - Raw request body as a Buffer (preferred)
 *   or string. JSON-parsed bodies will not match.
 * @param {number} [args.nowMs=Date.now()] - Override for clock in tests.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyResendSignature({
  secret,
  svixId,
  svixTimestamp,
  svixSignature,
  rawBody,
  nowMs = Date.now(),
}) {
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "missing_headers" };
  }

  // Replay protection: timestamp must be within +/- REPLAY_TOLERANCE_MS.
  const tsSeconds = Number.parseInt(svixTimestamp, 10);
  if (!Number.isFinite(tsSeconds)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  const tsMs = tsSeconds * 1000;
  if (Math.abs(nowMs - tsMs) > REPLAY_TOLERANCE_MS) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  // Strip optional `whsec_` prefix and base64-decode the secret.
  const rawSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let secretBytes;
  try {
    secretBytes = Buffer.from(rawSecret, "base64");
  } catch {
    return { ok: false, reason: "bad_secret" };
  }
  if (secretBytes.length === 0) {
    return { ok: false, reason: "bad_secret" };
  }

  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? "", "utf8");
  const signedPayload = Buffer.concat([
    Buffer.from(`${svixId}.${svixTimestamp}.`, "utf8"),
    bodyBuffer,
  ]);

  const expected = crypto.createHmac("sha256", secretBytes).update(signedPayload).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");

  // Header may contain multiple space-separated versioned signatures.
  // We only support v1 (HMAC-SHA256). Iterate and accept any constant-time match.
  const candidates = svixSignature.split(" ").filter(Boolean);
  for (const candidate of candidates) {
    const [version, sig] = candidate.split(",");
    if (version !== "v1" || !sig) continue;
    const sigBuf = Buffer.from(sig, "utf8");
    if (sigBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "signature_mismatch" };
}

/**
 * Apply a Resend event to its matching EmailLog row.
 *
 * Returns metadata about what happened so the caller can log a structured
 * line. Never throws on "missing row" -- a 200 with logged miss is the
 * documented behaviour for unknown messageIds (test events from the
 * dashboard, races against the sender, etc.).
 *
 * @param {object} event - Parsed Resend event payload (`{ type, data, ... }`).
 * @param {object} logger - Per-request logger from `createLogger(req)`.
 * @returns {Promise<{ matched: boolean, applied: boolean, status?: string }>}
 */
export async function applyResendEvent(event, logger) {
  const eventType = event?.type;
  const data = event?.data ?? {};
  const messageId = data.email_id || data.id || null;

  if (!eventType) {
    return { matched: false, applied: false };
  }

  if (!messageId) {
    logger.warn("Resend webhook event has no messageId", { eventType });
    return { matched: false, applied: false };
  }

  const row = await EmailLog.findOne({ where: { messageId } });
  if (!row) {
    logger.info("Resend webhook event for unknown messageId", {
      eventType,
      messageId,
    });
    return { matched: false, applied: false };
  }

  const now = new Date();

  switch (eventType) {
    case "email.sent": {
      // Informational. Row was created when the send was queued; nothing
      // to update beyond confirming the provider accepted the message.
      return { matched: true, applied: false, status: row.status };
    }

    case "email.delivered": {
      row.status = "delivered";
      row.deliveredAt = now;
      await row.save();
      return { matched: true, applied: true, status: "delivered" };
    }

    case "email.opened": {
      // Do not downgrade from clicked -> opened. clickCount captures
      // engagement upgrade; status reflects highest signal seen.
      if (row.status !== "clicked") {
        row.status = "opened";
      }
      if (!row.openedAt) {
        row.openedAt = now;
      }
      row.openCount = (row.openCount || 0) + 1;
      if (data.user_agent) row.userAgent = data.user_agent;
      if (data.ip) row.ipAddress = data.ip;
      await row.save();
      return { matched: true, applied: true, status: row.status };
    }

    case "email.clicked": {
      row.status = "clicked";
      if (!row.clickedAt) {
        row.clickedAt = now;
      }
      row.clickCount = (row.clickCount || 0) + 1;
      if (data.user_agent) row.userAgent = data.user_agent;
      if (data.ip) row.ipAddress = data.ip;
      await row.save();
      return { matched: true, applied: true, status: "clicked" };
    }

    case "email.bounced": {
      row.status = "bounced";
      row.bouncedAt = now;
      const bounce = data.bounce ?? {};
      // Resend uses `subType` like "Permanent" / "Transient"; map to soft/hard.
      const subType = (bounce.subType || bounce.type || "").toLowerCase();
      if (subType.startsWith("perm")) {
        row.bounceType = "hard";
      } else if (subType.startsWith("trans") || subType.startsWith("soft")) {
        row.bounceType = "soft";
      } else if (subType) {
        row.bounceType = subType.slice(0, 50);
      }
      row.bounceReason = bounce.message || data.message || null;
      await row.save();
      return { matched: true, applied: true, status: "bounced" };
    }

    case "email.complained": {
      row.status = "complained";
      row.spamReportedAt = now;
      await row.save();
      return { matched: true, applied: true, status: "complained" };
    }

    case "email.delivery_delayed": {
      // No dedicated column; record on metadata for diagnosis without
      // changing the row's primary status.
      const meta = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
      meta.delayedAt = now.toISOString();
      row.metadata = meta;
      await row.save();
      return { matched: true, applied: true, status: row.status };
    }

    default: {
      logger.info("Resend webhook event type ignored", { eventType, messageId });
      return { matched: true, applied: false, status: row.status };
    }
  }
}

/**
 * Build the express handler. Exported as a factory so tests can inject a
 * fixed clock for replay-window assertions without monkey-patching Date.
 *
 * @param {object} [options]
 * @param {() => number} [options.now] - Clock injection for tests.
 */
export function buildResendWebhookHandler(options = {}) {
  const clock = typeof options.now === "function" ? options.now : () => Date.now();

  return async function resendWebhookHandler(req, res) {
    const logger = createLogger(req);
    const secret = process.env.RESEND_WEBHOOK_SECRET;

    if (!secret) {
      logger.error("Resend webhook secret not configured");
      return res.status(500).json({ error: "webhook_not_configured" });
    }

    const svixId = req.headers["svix-id"] || req.headers["webhook-id"];
    const svixTimestamp = req.headers["svix-timestamp"] || req.headers["webhook-timestamp"];
    const svixSignature = req.headers["svix-signature"] || req.headers["webhook-signature"];

    // req.body is a Buffer here because the route is mounted with
    // express.raw(). If a future refactor drops that, every signature check
    // will fail -- guard against it explicitly.
    if (!Buffer.isBuffer(req.body)) {
      logger.error("Resend webhook expected raw body buffer", {
        actualType: typeof req.body,
      });
      return res.status(500).json({ error: "webhook_misconfigured" });
    }

    const verification = verifyResendSignature({
      secret,
      svixId,
      svixTimestamp,
      svixSignature,
      rawBody: req.body,
      nowMs: clock(),
    });

    if (!verification.ok) {
      logger.warn("Resend webhook signature rejected", { reason: verification.reason });
      return res.status(400).json({ error: "invalid_signature", reason: verification.reason });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch (err) {
      logger.warn("Resend webhook body is not valid JSON", { error: err.message });
      return res.status(400).json({ error: "invalid_json" });
    }

    try {
      const result = await applyResendEvent(event, logger);
      logger.info("Resend webhook processed", {
        eventType: event?.type,
        messageId: event?.data?.email_id || event?.data?.id || null,
        matched: result.matched,
        applied: result.applied,
      });
      // Always 200 on a verified payload, even if the row is unknown -- the
      // event was authentic, just not relevant to us. 4xx would trigger
      // Resend retries and eventual endpoint disablement.
      return res.status(200).json({ received: true, ...result });
    } catch (err) {
      logger.error("Resend webhook handler failed", err);
      return res.status(500).json({ error: "webhook_handler_failed" });
    }
  };
}

// Default route mount: POST /resend (the parent mounts this router at
// /api/webhooks). The handler must run AFTER express.raw() in the parent.
router.post("/resend", buildResendWebhookHandler());

export default router;
