/**
 * Internal Admin Routes (#808 Phase 3 + admin console migration)
 *
 * Mounted at /api/internal in index.js with authenticate middleware.
 * All routes additionally require PLATFORM_OWNER_ID via requirePlatformOwner.
 * Access is via https://admin.br360.example.com (GitHub OAuth login).
 *
 * Routes:
 *   GET  /api/internal/me                        -- current admin user info
 *   GET  /api/internal/consultants               -- list consultants with stats
 *   POST /api/internal/consultants/invite        -- create an invite
 *   PATCH /api/internal/consultants/:id          -- update commissionRate / isActive
 *   PATCH /api/internal/consultants/:id/access    -- grant/revoke org access
 *   GET  /api/internal/consultants/:id/payments  -- list payment log
 *   POST /api/internal/consultants/:id/payments  -- record a confirmed payment
 *   GET  /api/internal/commission/preview        -- month-to-date estimate
 *   POST /api/internal/commission/run            -- trigger commission job now
 *   GET  /api/internal/ops/metrics               -- error rate + queue depth over time (#848)
 */

import express from "express";
import crypto from "crypto";
import { body, param, query, validationResult } from "express-validator";
import { Op } from "sequelize";
import { requirePlatformOwner } from "../middleware/auth.js";
import { createLogger } from "../utils/logger.js";
import { sendTemplateEmail } from "../emails/utils/sendEmail.js";
import { ConsultantInviteEmail } from "../emails/templates/consultants/ConsultantInviteEmail.jsx";
import Consultant from "../models/Consultant.js";
import ConsultantInvite from "../models/ConsultantInvite.js";
import Organization from "../models/Organization.js";
import UserOrganizationMembership from "../models/UserOrganizationMembership.js";
import CommissionRun from "../models/CommissionRun.js";
import ConsultantPayment from "../models/ConsultantPayment.js";
import ErrorEvent from "../models/ErrorEvent.js";
import MetricsSample from "../models/MetricsSample.js";
import EmailQueue from "../models/EmailQueue.js";
import { runCommissionJob } from "../jobs/commissionJob.js";

export const internalRouter = express.Router();

const SITE_URL = process.env.FRONTEND_URL || "https://br360.example.com";

// ---------------------------------------------------------------------------
// Platform-owner guard (authenticate middleware is applied at the mount point in index.js)
// Only the PLATFORM_OWNER_ID user (Rodney) may access these routes.
// ---------------------------------------------------------------------------

internalRouter.use(requirePlatformOwner);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rejectIfInvalid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return null;
}

function centsToDisplay(cents) {
  return `$${(cents / 100).toFixed(2)} AUD`;
}

// ---------------------------------------------------------------------------
// GET /api/internal/me
// ---------------------------------------------------------------------------

internalRouter.get("/me", (req, res) => {
  return res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    isSuperuser: req.user.isSuperuser,
  });
});

// ---------------------------------------------------------------------------
// GET /api/internal/consultants
// ---------------------------------------------------------------------------

internalRouter.get("/consultants", async (req, res) => {
  const log = createLogger(req);
  try {
    const consultants = await Consultant.findAll({
      order: [["createdAt", "DESC"]],
    });

    // For each consultant, count their referred orgs and sum commission YTD.
    const results = await Promise.all(
      consultants.map(async (c) => {
        const orgCount = await Organization.count({
          where: { referredBy: c.referralCode },
        });

        const now = new Date();
        const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
        const runs = await CommissionRun.findAll({
          where: { consultantId: c.id, runAt: { [Op.gte]: yearStart } },
          attributes: ["totalCommissionCents"],
        });
        const commissionYtdCents = runs.reduce((s, r) => s + r.totalCommissionCents, 0);

        return {
          id: c.id,
          userId: c.userId,
          firstName: c.firstName,
          lastName: c.lastName,
          companyName: c.companyName,
          abn: c.abn,
          referralCode: c.referralCode,
          commissionRate: Number(c.commissionRate),
          isActive: c.isActive,
          referredOrgCount: orgCount,
          commissionYtdCents,
          commissionYtdDisplay: centsToDisplay(commissionYtdCents),
          createdAt: c.createdAt,
        };
      })
    );

    return res.json(results);
  } catch (err) {
    log.error("[Internal:consultants] Error", { message: err.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /internal/consultants/invite
// ---------------------------------------------------------------------------

internalRouter.post(
  "/consultants/invite",
  [
    body("email").isEmail().withMessage("A valid email address is required").normalizeEmail(),
    body("firstName")
      .notEmpty()
      .withMessage("First name is required")
      .isString()
      .trim()
      .isLength({ max: 100 }),
    body("lastName")
      .notEmpty()
      .withMessage("Last name is required")
      .isString()
      .trim()
      .isLength({ max: 100 }),
    body("commissionRate")
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage("commissionRate must be between 0 and 1"),
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    const { email, firstName, lastName, commissionRate = 0.3 } = req.body;

    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const token = crypto.randomUUID();

      const invite = await ConsultantInvite.create({
        token,
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        expiresAt,
        commissionRate,
      });

      const signupUrl = `${SITE_URL}/consultant-signup?invite=${token}`;
      const commissionPct = Math.round(Number(commissionRate) * 100);

      const sendResult = await sendTemplateEmail({
        to: email,
        subject: "You're invited to join BR360 as a consultant",
        template: ConsultantInviteEmail,
        templateProps: {
          firstName: invite.firstName,
          signupUrl,
          commissionPct,
        },
        categories: ["consultant-invite"],
      });

      if (!sendResult.success) {
        log.warn("[Internal:invite] Email send failed", {
          inviteId: invite.id,
          email,
          error: sendResult.error,
        });
      }

      log.info("[Internal:invite] Invite created", {
        inviteId: invite.id,
        email,
        emailSent: sendResult.success,
        messageId: sendResult.messageId,
      });

      return res.status(201).json({
        id: invite.id,
        token: invite.token,
        email: invite.email,
        expiresAt: invite.expiresAt,
        commissionRate: Number(invite.commissionRate),
        emailSent: sendResult.success,
        signupUrl,
      });
    } catch (err) {
      log.error("[Internal:invite] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /internal/consultants/:id: update commissionRate / isActive
// ---------------------------------------------------------------------------

internalRouter.patch(
  "/consultants/:id",
  [
    body("commissionRate")
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage("commissionRate must be between 0 and 1"),
    body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    const { commissionRate, isActive } = req.body;

    try {
      const consultant = await Consultant.findByPk(req.params.id);
      if (!consultant) {
        return res.status(404).json({ error: "Consultant not found" });
      }

      if (commissionRate !== undefined) consultant.commissionRate = commissionRate;
      if (isActive !== undefined) consultant.isActive = isActive;
      await consultant.save();

      log.info("[Internal:consultants] Updated consultant", {
        id: consultant.id,
        commissionRate: consultant.commissionRate,
        isActive: consultant.isActive,
      });

      return res.json({
        id: consultant.id,
        commissionRate: Number(consultant.commissionRate),
        isActive: consultant.isActive,
      });
    } catch (err) {
      log.error("[Internal:consultants] Update error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /internal/consultants/:id/access
// ---------------------------------------------------------------------------

internalRouter.patch(
  "/consultants/:id/access",
  [
    body("organizationId").notEmpty().withMessage("organizationId is required").isString(),
    body("grant").isBoolean().withMessage("grant must be a boolean"),
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    const { organizationId, grant } = req.body;

    try {
      const consultant = await Consultant.findByPk(req.params.id);
      if (!consultant) {
        return res.status(404).json({ error: "Consultant not found" });
      }

      if (!consultant.userId) {
        return res.status(400).json({
          error:
            "Consultant has no BR360 user account yet. They must complete their profile first.",
        });
      }

      if (grant) {
        // Create membership if it doesn't already exist.
        await UserOrganizationMembership.findOrCreate({
          where: { userId: consultant.userId, organizationId },
          defaults: {
            userId: consultant.userId,
            organizationId,
            isAdmin: false,
            isApproved: true,
            isSuperuser: false,
          },
        });
        log.info("[Internal:access] Membership granted", {
          userId: consultant.userId,
          organizationId,
        });
        return res.json({ status: "granted", userId: consultant.userId, organizationId });
      } else {
        await UserOrganizationMembership.destroy({
          where: { userId: consultant.userId, organizationId },
        });
        log.info("[Internal:access] Membership revoked", {
          userId: consultant.userId,
          organizationId,
        });
        return res.json({ status: "revoked", userId: consultant.userId, organizationId });
      }
    } catch (err) {
      log.error("[Internal:access] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /internal/consultants/:id/payments: list payment log
// POST /internal/consultants/:id/payments: record a confirmed payment
// ---------------------------------------------------------------------------

internalRouter.get(
  "/consultants/:id/payments",
  [param("id").isUUID(4).withMessage("id must be a valid UUID")],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    try {
      const consultant = await Consultant.findByPk(req.params.id);
      if (!consultant) return res.status(404).json({ error: "Consultant not found" });

      const payments = await ConsultantPayment.findAll({
        where: { consultantId: req.params.id },
        order: [
          ["periodYear", "DESC"],
          ["periodMonth", "DESC"],
        ],
      });

      return res.json(payments);
    } catch (err) {
      log.error("[Internal:payments:list] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

internalRouter.post(
  "/consultants/:id/payments",
  [
    param("id").isUUID(4).withMessage("id must be a valid UUID"),
    body("periodMonth").isInt({ min: 1, max: 12 }).withMessage("periodMonth must be 1-12"),
    body("periodYear").isInt({ min: 2020 }).withMessage("periodYear must be 2020 or later"),
    body("amountCents")
      .isInt({ min: 1, max: 100_000_000 })
      .withMessage("amountCents must be between 1 and 100,000,000"),
    body("notes").optional({ checkFalsy: true }).isString().trim().isLength({ max: 500 }),
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    const { periodMonth, periodYear, amountCents, notes } = req.body;

    try {
      const consultant = await Consultant.findByPk(req.params.id);
      if (!consultant) return res.status(404).json({ error: "Consultant not found" });

      const payment = await ConsultantPayment.create({
        consultantId: req.params.id,
        periodMonth,
        periodYear,
        amountCents,
        notes: notes || null,
        confirmedAt: new Date(),
      });

      log.info("[Internal:payments:record] Payment recorded", {
        consultantId: req.params.id,
        periodMonth,
        periodYear,
        amountCents,
      });

      return res.status(201).json(payment);
    } catch (err) {
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ error: "A payment for this period is already recorded." });
      }
      log.error("[Internal:payments:record] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /internal/commission/preview
// ---------------------------------------------------------------------------

internalRouter.get("/commission/preview", async (req, res) => {
  const log = createLogger(req);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.json({
      warning: "Stripe is not configured. No preview available.",
      consultants: [],
    });
  }

  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);
    const { platformSequelize } = await import("../models/platformDatabase.js");
    const { QueryTypes } = await import("sequelize");

    const consultants = await Consultant.findAll({ where: { isActive: true } });
    const previews = [];

    for (const c of consultants) {
      const orgs = await Organization.findAll({
        where: { referredBy: c.referralCode },
        attributes: ["organizationId", "organizationName"],
      });

      let grossCents = 0;
      const orgSummaries = [];

      for (const org of orgs) {
        try {
          const rows = await platformSequelize.query(
            `SELECT stripe_customer_id FROM tenants WHERE org_id = :orgId LIMIT 1`,
            { replacements: { orgId: org.organizationId }, type: QueryTypes.SELECT }
          );

          if (!rows.length || !rows[0].stripe_customer_id) continue;

          const subs = await stripe.subscriptions.list({
            customer: rows[0].stripe_customer_id,
            status: "active",
            limit: 10,
          });

          let orgGross = 0;
          for (const sub of subs.data) {
            if (sub.latest_invoice && typeof sub.latest_invoice === "object") {
              orgGross += sub.latest_invoice.amount_paid || 0;
            } else {
              const item = sub.items?.data?.[0];
              if (item?.price?.unit_amount) orgGross += item.price.unit_amount;
            }
          }

          if (orgGross > 0) {
            grossCents += orgGross;
            orgSummaries.push({ orgName: org.organizationName, grossCents: orgGross });
          }
        } catch (_err) {
          // Swallow per-org Stripe errors in preview.
        }
      }

      const commissionCents = Math.floor(grossCents * Number(c.commissionRate));
      previews.push({
        consultantId: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        referralCode: c.referralCode,
        commissionRate: Number(c.commissionRate),
        grossCents,
        commissionCents,
        grossDisplay: centsToDisplay(grossCents),
        commissionDisplay: centsToDisplay(commissionCents),
        orgs: orgSummaries,
      });
    }

    return res.json({ consultants: previews });
  } catch (err) {
    log.error("[Internal:commission-preview] Error", { message: err.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /internal/commission/run
// ---------------------------------------------------------------------------

internalRouter.post("/commission/run", async (req, res) => {
  const log = createLogger(req);
  const triggeredAt = new Date().toISOString();

  log.info("[Internal:commission-run] Manual commission run triggered");

  // Fire and forget: respond immediately so the HTTP call does not time out
  // while Stripe queries are in flight. Errors are written to the logger.
  setImmediate(() => {
    runCommissionJob({ triggeredBy: "manual" }).catch((err) => {
      log.error("[Internal:commission-run] Job error", { message: err.message });
    });
  });

  return res.json({ status: "ok", triggeredAt });
});

// ---------------------------------------------------------------------------
// GET /internal/ops/metrics: error rate + email-queue depth over time (#848)
// ---------------------------------------------------------------------------

/**
 * Bucket a set of ErrorEvent rows into hourly counts. Done in JS rather than
 * SQL date_trunc: date_trunc is Postgres-only and this route must also work
 * against the SQLite Jest test harness. Volumes here are tiny (error events,
 * not general traffic), so the JS pass is the simplest portable option.
 *
 * Returns buckets in chronological order for every hour in the window, with
 * zero-count hours included, so the chart does not show gaps as "no data".
 */
function bucketErrorsByHour(rows, hours) {
  const now = new Date();
  const buckets = new Map();
  for (let i = hours - 1; i >= 0; i -= 1) {
    const bucketDate = new Date(now);
    bucketDate.setUTCMinutes(0, 0, 0);
    bucketDate.setUTCHours(bucketDate.getUTCHours() - i);
    buckets.set(bucketDate.toISOString(), 0);
  }
  for (const row of rows) {
    const bucketDate = new Date(row.createdAt);
    bucketDate.setUTCMinutes(0, 0, 0);
    const key = bucketDate.toISOString();
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key) + 1);
    }
  }
  return Array.from(buckets.entries()).map(([bucket, count]) => ({ bucket, count }));
}

internalRouter.get(
  "/ops/metrics",
  [
    query("hours")
      .optional()
      .isInt({ min: 1, max: 720 })
      .withMessage("hours must be an integer between 1 and 720"),
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    const hours = req.query.hours ? parseInt(req.query.hours, 10) : 24;

    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [errorRows, sampleRows, errors24h, currentPending, currentFailed] = await Promise.all([
        ErrorEvent.findAll({
          where: { createdAt: { [Op.gte]: since } },
          attributes: ["createdAt"],
          order: [["createdAt", "ASC"]],
        }),
        MetricsSample.findAll({
          where: { sampledAt: { [Op.gte]: since } },
          order: [["sampledAt", "ASC"]],
        }),
        ErrorEvent.count({ where: { createdAt: { [Op.gte]: dayAgo } } }),
        EmailQueue.count({ where: { status: "pending" } }),
        EmailQueue.count({ where: { status: "failed" } }),
      ]);

      const errorSeries = bucketErrorsByHour(errorRows, hours);
      const queueSeries = sampleRows.map((s) => ({
        sampledAt: s.sampledAt,
        pending: s.emailQueuePending,
        failed: s.emailQueueFailed,
      }));

      return res.json({
        errorSeries,
        queueSeries,
        totals: { errors24h, currentPending, currentFailed },
      });
    } catch (err) {
      log.error("[Internal:ops-metrics] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default internalRouter;
