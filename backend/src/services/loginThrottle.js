// Issue #859 -- per-credential login lockout.
//
// The 5a rate limiters are volume throttling (IP / email request count).
// This is per-account brute-force lockout: after too many failed
// attempts for one credential key inside a sliding window, the key is
// locked for an escalating duration. Cleared on successful auth and on
// password-reset success.
//
// Design notes (full rationale in docs/AUTH_ONBOARDING_PLAN.md #859):
//  - Keyed by the SUBMITTED credential, counted regardless of whether
//    the account exists, so lock behaviour cannot enumerate accounts.
//  - Backed by the LoginThrottle table (migration 0022). No Sequelize
//    model, no RLS: auth infrastructure, written on the
//    resolveTenant-skipped /auth/login path.
//  - FAIL OPEN: a throttle-table outage must never break all logins.
//    The IP + email rate limiters still cap brute force in that case.
//  - Disabled under DISABLE_RATE_LIMIT (so .env.test stays hermetic,
//    same flag the limiters honour) or a dedicated DISABLE_LOGIN_LOCKOUT.
import crypto from "crypto";
// Import the raw connection from database.js, NOT models/index.js:
// index.js eagerly wires every model association at load, so pulling it
// into this leaf service would break any test that mocks an individual
// model (Idea.belongsTo(mockUser) -> "not a subclass of Sequelize.Model").
// The throttle only needs the connection, not the model graph.
import { sequelize } from "../models/database.js";
import { QueryTypes } from "sequelize";
import { logger } from "../utils/logger.js";

const truthy = (v) => v === "true" || v === "1";
const isDisabled = () =>
  truthy(process.env.DISABLE_RATE_LIMIT) || truthy(process.env.DISABLE_LOGIN_LOCKOUT);

const intEnv = (name, def) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : def;
};
const cfg = () => ({
  max: intEnv("LOGIN_LOCKOUT_MAX_FAILURES", 10),
  windowMs: intEnv("LOGIN_LOCKOUT_WINDOW_MS", 15 * 60 * 1000),
  baseMs: intEnv("LOGIN_LOCKOUT_BASE_MS", 15 * 60 * 1000),
  capMs: intEnv("LOGIN_LOCKOUT_MAX_MS", 24 * 60 * 60 * 1000),
});

// The key embeds an email (PII). Never log it raw; a short non-reversible
// digest is enough to correlate lock events in logs.
const keyDigest = (key) =>
  crypto.createHash("sha256").update(String(key)).digest("hex").slice(0, 12);

/**
 * Bucket key for a login attempt. Org-less and org-scoped both key off
 * the normalised email (#892: email is the sole credential on both
 * paths). Returns null when there is nothing to key on (caller then
 * skips throttling).
 */
export function loginThrottleKey({ organizationId, email } = {}) {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!e) return null;
  return organizationId ? `org:${organizationId}:email:${e}` : `email:${e}`;
}

/** True if this key is currently locked. Fails open on infra error. */
export async function isLocked(key) {
  if (!key || isDisabled()) return false;
  try {
    const rows = await sequelize.query(
      `SELECT "lockedUntil" FROM "LoginThrottle" WHERE "key" = :key`,
      { replacements: { key }, type: QueryTypes.SELECT }
    );
    const lockedUntil = rows[0]?.lockedUntil;
    return !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();
  } catch (err) {
    logger.error("[LoginThrottle] isLocked failed; failing open", {
      message: err.message,
    });
    return false;
  }
}

/**
 * Record one failed attempt for this key. Resets the counter when the
 * sliding window has elapsed; locks (with escalating duration) once the
 * threshold is hit; leaves an already-locked key untouched so a flood
 * of attempts during a lock cannot extend it indefinitely (escalation
 * only happens on a fresh lock cycle). Best-effort; never throws.
 */
export async function registerFailure(key) {
  if (!key || isDisabled()) return;
  const { max, windowMs, baseMs, capMs } = cfg();
  try {
    await sequelize.transaction(async (tx) => {
      await sequelize.query(
        `INSERT INTO "LoginThrottle" ("key") VALUES (:key)
           ON CONFLICT ("key") DO NOTHING`,
        { replacements: { key }, type: QueryTypes.INSERT, transaction: tx }
      );
      const rows = await sequelize.query(
        `SELECT "failedCount", "windowStartedAt", "lockedUntil", "lockStrikes"
           FROM "LoginThrottle" WHERE "key" = :key FOR UPDATE`,
        { replacements: { key }, type: QueryTypes.SELECT, transaction: tx }
      );
      const r = rows[0];
      const now = Date.now();
      const lockedActive = r.lockedUntil && new Date(r.lockedUntil).getTime() > now;
      if (lockedActive) return; // do not extend an active lock

      const windowAge = now - new Date(r.windowStartedAt).getTime();
      if (windowAge > windowMs) {
        await sequelize.query(
          `UPDATE "LoginThrottle"
             SET "failedCount" = 1, "windowStartedAt" = NOW(),
                 "lockedUntil" = NULL, "updatedAt" = NOW()
           WHERE "key" = :key`,
          { replacements: { key }, type: QueryTypes.UPDATE, transaction: tx }
        );
        return;
      }

      const failedCount = r.failedCount + 1;
      if (failedCount >= max) {
        const strikes = r.lockStrikes + 1;
        const durMs = Math.min(baseMs * 2 ** (strikes - 1), capMs);
        const durSecs = Math.ceil(durMs / 1000);
        await sequelize.query(
          `UPDATE "LoginThrottle"
             SET "failedCount" = 0, "windowStartedAt" = NOW(),
                 "lockedUntil" = NOW() + make_interval(secs => :durSecs),
                 "lockStrikes" = :strikes, "updatedAt" = NOW()
           WHERE "key" = :key`,
          {
            replacements: { key, durSecs, strikes },
            type: QueryTypes.UPDATE,
            transaction: tx,
          }
        );
        logger.warn("[LoginThrottle] credential key locked", {
          key: keyDigest(key),
          strikes,
          lockMs: durMs,
        });
        return;
      }

      await sequelize.query(
        `UPDATE "LoginThrottle"
           SET "failedCount" = :failedCount, "updatedAt" = NOW()
         WHERE "key" = :key`,
        {
          replacements: { key, failedCount },
          type: QueryTypes.UPDATE,
          transaction: tx,
        }
      );
    });
  } catch (err) {
    logger.error("[LoginThrottle] registerFailure failed", {
      message: err.message,
    });
  }
}

/** Clear all throttle state for a key (successful auth / password reset). */
export async function clearThrottle(key) {
  if (!key || isDisabled()) return;
  try {
    await sequelize.query(`DELETE FROM "LoginThrottle" WHERE "key" = :key`, {
      replacements: { key },
      type: QueryTypes.DELETE,
    });
  } catch (err) {
    logger.error("[LoginThrottle] clearThrottle failed", {
      message: err.message,
    });
  }
}
