// Consultant Routes
// Issue #808 Phase 1: invite-only consultant onboarding
// Issue #808 Phase 2: validate-code public endpoint + referral wiring
//
// Platform-level routes (no tenant context). Split into public and protected
// sub-routers following the pattern from routes/contact.js and routes/billing.js.
//
// Middleware chain (in index.js):
//   /api/consultants (public)  -> publicRouter  (no authenticate)
//   /api/consultants (protected) -> authenticate -> protectedRouter
//
// resolveTenant and wrapTenantTransaction run globally on /api but are no-ops
// when req.tenant is absent, so platform-level routes are unaffected.

import express from "express";
import crypto from "crypto";
import { body, validationResult } from "express-validator";
import { Op } from "sequelize";
import { requirePlatformOwner } from "../middleware/auth.js";
import { hashPassword } from "../utils/passwordHash.js";
import { createLogger } from "../utils/logger.js";
import { sendTemplateEmail } from "../emails/utils/sendEmail.js";
import { ConsultantInviteEmail } from "../emails/templates/consultants/ConsultantInviteEmail.jsx";
import { ConsultantWelcomeEmail } from "../emails/templates/consultants/ConsultantWelcomeEmail.jsx";
import Consultant from "../models/Consultant.js";
import ConsultantInvite from "../models/ConsultantInvite.js";
import User from "../models/User.js";
import UserOrganizationMembership from "../models/UserOrganizationMembership.js";
import { withTenantContext } from "../utils/withTenantContext.js";
import { getTenantId } from "../middleware/tenantResolver.js";

export const publicRouter = express.Router();
export const protectedRouter = express.Router();

const SITE_URL = "https://br360.example.com";

/**
 * Validates an Australian Business Number (ABN) using the official checksum.
 * Returns true if valid, false otherwise.
 */
function isValidAbn(abn) {
  const digits = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = weights.reduce((acc, w, i) => {
    const d = i === 0 ? parseInt(digits[i]) - 1 : parseInt(digits[i]);
    return acc + w * d;
  }, 0);
  return sum % 89 === 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the first express-validator error response if validation failed. */
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

/**
 * Auto-generate a referral code.
 * Priority: company name slug > first name slug, always suffixed with 4 random digits.
 */
function generateReferralCode(firstName, companyName) {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const base = companyName
    ? companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20) || firstName.toLowerCase().replace(/[^a-z]/g, "")
    : firstName.toLowerCase().replace(/[^a-z]/g, "");
  return `${base || "ref"}-${digits}`;
}

/**
 * Pre-provision a demo-corp account for an invited consultant and return a
 * password-reset (activation) URL. Find-or-create so a re-issued invite just
 * refreshes the reset token. Reuses the existing /reset-password flow, which
 * already auto-logs-in, so no separate activation endpoint is needed.
 *
 * The legacy POST /signup still has its own inline copy of this logic: it is
 * the dual-path shim for invites issued before this pre-create flow (decision
 * C). Left intentionally un-refactored to keep regression risk off the path
 * still serving in-flight invites; removed in a follow-up once the 7-day
 * invite TTL window closes.
 *
 * Returns the activation URL, or null if the demo tenant cannot be resolved
 * (caller falls back to the legacy signup URL so onboarding still works).
 */
async function provisionDemoConsultantAccount({ email, log }) {
  const DEMO_ORG_ID = "demo-corp";
  const demoTenantId = await getTenantId(DEMO_ORG_ID);
  if (!demoTenantId) return null;

  const rawResetToken = crypto.randomBytes(32).toString("hex");
  const hashedResetToken = crypto.createHash("sha256").update(rawResetToken).digest("hex");
  const resetExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
  const randomPassword = crypto.randomBytes(24).toString("hex");
  const passwordHash = await hashPassword(randomPassword);
  const username = email;

  await withTenantContext(demoTenantId, async () => {
    const existing = await User.findOne({
      where: { username, organizationId: DEMO_ORG_ID },
    });
    if (existing) {
      await existing.update({
        passwordResetToken: hashedResetToken,
        passwordResetExpires: resetExpires,
      });
      return;
    }
    const demoUser = await User.create({
      username,
      passwordHash,
      email,
      isAnonymous: false,
      isAdmin: true,
      isSuperuser: true,
      isApproved: true,
      organizationId: DEMO_ORG_ID,
      tenant_id: demoTenantId,
      passwordResetToken: hashedResetToken,
      passwordResetExpires: resetExpires,
    });
    await UserOrganizationMembership.create({
      userId: demoUser.id,
      organizationId: DEMO_ORG_ID,
      isAdmin: true,
      isApproved: true,
      isSuperuser: true,
    });
  });

  log?.info?.("[Consultants:invite] Demo account pre-provisioned", { username });
  return `https://demo-corp.br360.example.com/reset-password?token=${rawResetToken}&activation=1`;
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

/**
 * GET /api/consultants/validate-code/:code
 * Validate a referral code. Public, no auth. Returns 200 always to avoid
 * enumeration timing differences (never 404).
 *
 * 200 { valid: true,  consultantName: string, companyName: string | null }
 * 200 { valid: false }
 */
publicRouter.get("/validate-code/:code", async (req, res) => {
  const log = createLogger(req);
  try {
    const consultant = await Consultant.findOne({
      where: { referralCode: req.params.code, isActive: true },
      attributes: ["firstName", "lastName", "companyName"],
    });

    if (!consultant) {
      return res.json({ valid: false });
    }

    return res.json({
      valid: true,
      consultantName: `${consultant.firstName} ${consultant.lastName}`.trim(),
      companyName: consultant.companyName || null,
    });
  } catch (err) {
    log.error("[Consultants:validate-code] Error", { message: err.message });
    // On error, return valid: false so signup can continue unblocked.
    return res.json({ valid: false });
  }
});

/**
 * GET /api/consultants/invite/:token
 * Look up a pending invite. Used by the signup page to prefill the form.
 *
 * 404 -> invite not found
 * 410 -> invite expired or already used
 * 200 -> { email, firstName, lastName }
 */
publicRouter.get("/invite/:token", async (req, res) => {
  const log = createLogger(req);
  try {
    const invite = await ConsultantInvite.findOne({
      where: { token: req.params.token },
    });

    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }

    if (invite.isExpired()) {
      return res
        .status(410)
        .json({ error: "This invite link has expired or has already been used" });
    }

    return res.json({
      email: invite.email,
      firstName: invite.firstName,
      lastName: invite.lastName,
      commissionRate: Number(invite.commissionRate),
    });
  } catch (err) {
    log.error("[Consultants:invite-lookup] Error", { message: err.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/consultants/signup
 * Complete a consultant profile from an invite token.
 *
 * Body: { token, companyName?, abn?, referralCode? }
 * Returns: { referralCode, referralUrl }
 */
publicRouter.post(
  "/signup",
  [
    body("token").isUUID(4).withMessage("token must be a valid UUID"),
    body("companyName").optional({ checkFalsy: true }).isString().trim().isLength({ max: 255 }),
    body("abn")
      .notEmpty()
      .withMessage("ABN is required")
      .isString()
      .trim()
      .custom((v) => {
        if (!isValidAbn(v)) throw new Error("Please enter a valid 11-digit Australian ABN");
        return true;
      }),
    body("referralCode").optional({ checkFalsy: true }).isString().trim().isLength({ max: 50 }),
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    const { token, companyName, abn, referralCode: rawCode } = req.body;

    try {
      const invite = await ConsultantInvite.findOne({ where: { token } });

      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      // Atomically mark the invite as used. Checks usedAt IS NULL and expiresAt > now
      // in the WHERE clause so concurrent requests cannot both succeed.
      const [affectedCount] = await ConsultantInvite.update(
        { usedAt: new Date() },
        { where: { id: invite.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } } }
      );
      if (affectedCount === 0) {
        return res
          .status(410)
          .json({ error: "This invite link has expired or has already been used" });
      }

      // Determine referral code: custom > company name slug > first name slug
      const trimmedCompany = companyName?.trim() || null;
      const needsGeneration = !rawCode || rawCode.toLowerCase() === "generate";
      let referralCode = needsGeneration
        ? generateReferralCode(invite.firstName, trimmedCompany)
        : rawCode.trim().toLowerCase();

      // Ensure uniqueness (retry once if auto-generated code collides)
      const existing = await Consultant.findOne({ where: { referralCode } });
      if (existing) {
        if (!needsGeneration) {
          return res
            .status(409)
            .json({ error: "That referral code is already taken. Please choose another." });
        }
        referralCode = generateReferralCode(invite.firstName, trimmedCompany);
      }

      const consultant = await Consultant.create({
        firstName: invite.firstName,
        lastName: invite.lastName,
        companyName: trimmedCompany,
        abn: abn.trim(),
        referralCode,
        commissionRate: Number(invite.commissionRate),
        isActive: true,
      });

      const referralUrl = `${SITE_URL}/register?ref=${referralCode}`;
      const demoLoginUrl = "https://demo-corp.br360.example.com/review";

      // Create a BR360 demo account so the consultant can explore the platform.
      // Non-fatal: consultant record is already saved; email still sends.
      let demoResetUrl = null;
      try {
        const DEMO_ORG_ID = "demo-corp";
        const demoTenantId = await getTenantId(DEMO_ORG_ID);

        if (demoTenantId) {
          const rawResetToken = crypto.randomBytes(32).toString("hex");
          const hashedResetToken = crypto.createHash("sha256").update(rawResetToken).digest("hex");
          const resetExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
          const randomPassword = crypto.randomBytes(24).toString("hex");
          const passwordHash = await hashPassword(randomPassword);
          const username = invite.email;

          await withTenantContext(demoTenantId, async () => {
            let demoUser = await User.findOne({
              where: { username, organizationId: DEMO_ORG_ID },
            });

            if (demoUser) {
              // Account exists (e.g. re-signup after expiry). Refresh reset token.
              await demoUser.update({
                passwordResetToken: hashedResetToken,
                passwordResetExpires: resetExpires,
              });
            } else {
              demoUser = await User.create({
                username,
                passwordHash,
                email: invite.email,
                isAnonymous: false,
                isAdmin: true,
                isSuperuser: true,
                isApproved: true,
                organizationId: DEMO_ORG_ID,
                tenant_id: demoTenantId,
                passwordResetToken: hashedResetToken,
                passwordResetExpires: resetExpires,
              });

              await UserOrganizationMembership.create({
                userId: demoUser.id,
                organizationId: DEMO_ORG_ID,
                isAdmin: true,
                isApproved: true,
                isSuperuser: true,
              });
            }
          });

          demoResetUrl = `https://demo-corp.br360.example.com/reset-password?token=${rawResetToken}&activation=1`;
          log.info("[Consultants:signup] Demo account created/updated", { username });
        }
      } catch (demoErr) {
        log.error("[Consultants:signup] Demo account creation failed (non-fatal)", {
          message: demoErr.message,
        });
      }

      await sendTemplateEmail({
        to: invite.email,
        subject: "Welcome to BR360: your referral link and next steps",
        template: ConsultantWelcomeEmail,
        templateProps: {
          firstName: invite.firstName,
          email: invite.email,
          referralUrl,
          commissionPct: Math.round(Number(invite.commissionRate) * 100),
          demoResetUrl,
          demoLoginUrl,
        },
        categories: ["consultant-welcome"],
      });

      log.info("[Consultants:signup] Consultant created", {
        consultantId: consultant.id,
        referralCode,
      });

      return res.status(201).json({ referralCode, referralUrl, demoLoginUrl });
    } catch (err) {
      log.error("[Consultants:signup] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// Protected routes (platform owner only)
// ---------------------------------------------------------------------------

/**
 * POST /api/consultants/invite
 * Create and send a consultant invite. Platform owner only.
 *
 * Body: { email, firstName, lastName }
 * Returns: { id, token, email, expiresAt }
 */
protectedRouter.post(
  "/invite",
  requirePlatformOwner,
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
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    const { email, firstName, lastName } = req.body;

    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const token = crypto.randomUUID();

      const invite = await ConsultantInvite.create({
        token,
        email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        expiresAt,
      });

      // Pre-create the demo account at invite time and send an activation
      // (password-reset) link. Falls back to the legacy signup URL if the
      // demo tenant cannot be resolved, so onboarding still works.
      let inviteUrl = `${SITE_URL}/consultant-signup?invite=${token}`;
      try {
        const activationUrl = await provisionDemoConsultantAccount({
          email: invite.email,
          log,
        });
        if (activationUrl) inviteUrl = activationUrl;
      } catch (provErr) {
        log.error("[Consultants:invite] Pre-provision failed; using legacy signup URL", {
          message: provErr.message,
        });
      }

      await sendTemplateEmail({
        to: email,
        subject: "You're invited to join BR360 as a consultant",
        template: ConsultantInviteEmail,
        templateProps: {
          firstName: invite.firstName,
          signupUrl: inviteUrl,
          commissionPct: Math.round(Number(invite.commissionRate) * 100),
        },
        categories: ["consultant-invite"],
      });

      log.info("[Consultants:invite] Invite created", { inviteId: invite.id, email });

      return res.status(201).json({
        id: invite.id,
        token: invite.token,
        email: invite.email,
        expiresAt: invite.expiresAt,
      });
    } catch (err) {
      log.error("[Consultants:invite] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /api/consultants
 * List all consultants. Platform owner only.
 */
protectedRouter.get("/", requirePlatformOwner, async (req, res) => {
  const log = createLogger(req);
  try {
    const consultants = await Consultant.findAll({
      attributes: [
        "id",
        "userId",
        "firstName",
        "lastName",
        "companyName",
        "referralCode",
        "commissionRate",
        "isActive",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.json(consultants);
  } catch (err) {
    log.error("[Consultants:list] Error", { message: err.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/consultants/:id
 * Update commissionRate or isActive. Platform owner only.
 *
 * Body: { commissionRate?, isActive? }
 */
protectedRouter.patch(
  "/:id",
  requirePlatformOwner,
  [
    body("commissionRate")
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage("commissionRate must be a number between 0 and 1"),
    body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  ],
  async (req, res) => {
    const rejection = rejectIfInvalid(req, res);
    if (rejection) return rejection;

    const log = createLogger(req);
    try {
      const consultant = await Consultant.findByPk(req.params.id);
      if (!consultant) {
        return res.status(404).json({ error: "Consultant not found" });
      }

      const updates = {};
      if (req.body.commissionRate !== undefined) {
        updates.commissionRate = req.body.commissionRate;
      }
      if (req.body.isActive !== undefined) {
        updates.isActive = req.body.isActive;
      }

      await consultant.update(updates);

      log.info("[Consultants:update] Consultant updated", { consultantId: consultant.id, updates });

      return res.json({
        id: consultant.id,
        referralCode: consultant.referralCode,
        commissionRate: consultant.commissionRate,
        isActive: consultant.isActive,
      });
    } catch (err) {
      log.error("[Consultants:update] Error", { message: err.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default publicRouter;
