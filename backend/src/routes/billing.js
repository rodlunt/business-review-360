// Billing Routes
// Issue #323: Backend endpoint POST /api/billing/checkout
// Issue #324: Stripe webhook and provisioning queue
//
// Handles Stripe Checkout and webhooks for billing and tenant provisioning

import express from "express";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import isEmail from "validator/lib/isEmail.js";
import { validateOrganizationId } from "../utils/orgIdValidation.js";
import { hashPassword } from "../utils/passwordHash.js";
import { platformSequelize } from "../models/platformDatabase.js";
import { QueryTypes, UniqueConstraintError, Op } from "sequelize";
import Organization from "../models/Organization.js";
import User from "../models/User.js";
import {
  requireSameOrganization,
  generateToken,
  createSession,
  ACCESS_TOKEN_TTL_MS,
} from "../middleware/auth.js";
import { auditLogger } from "../middleware/auditLog.js";
import { enqueueTemplateEmail, EmailPriority } from "../services/emailQueueService.js";
import { SubscriptionCancelled } from "../emails/templates/notifications/SubscriptionCancelled.jsx";
import { PaymentFailed } from "../emails/templates/notifications/PaymentFailed.jsx";
import { TrialWelcome } from "../emails/templates/notifications/TrialWelcome.jsx";
import { SignupWelcome } from "../emails/templates/notifications/SignupWelcome.jsx";
import { DemoLeadCapture } from "../emails/templates/admin/DemoLeadCapture.jsx";
import { ConsultantAccessGrantedEmail } from "../emails/templates/consultants/ConsultantAccessGrantedEmail.jsx";
import { ConsultantAccessDeclinedEmail } from "../emails/templates/consultants/ConsultantAccessDeclinedEmail.jsx";
import Consultant from "../models/Consultant.js";
import ConsultantInvite from "../models/ConsultantInvite.js";
import UserOrganizationMembership from "../models/UserOrganizationMembership.js";
import { withTenantContext } from "../utils/withTenantContext.js";
import { logger, createLogger } from "../utils/logger.js";
import { notifyEvent, notifyError } from "../utils/ntfy.js";
import { verifyRecaptcha } from "../lib/recaptcha.js";
import { generateDemoToken } from "../middleware/auth.js";
import { getTenantUsage } from "../middleware/planLimits.js";

// #720: split into public + protected sub-routers so this file no longer
// imports `authenticate` directly. authenticate is mounted in index.js
// on the protected router. processWebhookEvent (further down) remains a
// module-level export consumed by index.js for the raw-body webhook route.
export const publicRouter = express.Router();
export const protectedRouter = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-03-31.basil",
});

// Issue #709: rate-limit POST /checkout. Anonymous, hits Stripe API per call,
// so the limit is tighter than the general auth tier (rateLimiters.auth =
// 20/15min). 5/IP/min covers a legitimate user retrying once or twice while
// blocking automated abuse. standardHeaders emits RateLimit-* plus
// Retry-After on 429 (RFC 6585 / draft-ietf-httpapi-ratelimit-headers).
// Disabled in test/dev via DISABLE_RATE_LIMIT to keep supertest hermetic.
const checkoutLimiter =
  process.env.DISABLE_RATE_LIMIT === "true" || process.env.DISABLE_RATE_LIMIT === "1"
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        message: {
          error: "Too many checkout attempts. Please try again in a minute.",
          code: "CHECKOUT_RATE_LIMITED",
        },
        standardHeaders: true,
        legacyHeaders: false,
      });

/**
 * Build the default Organisation record fields shared across signup paths.
 * Derives organizationName from the org slug (capitalise + replace hyphens).
 * Pass referredBy only when a validated referral code is available.
 */
function buildOrgDefaults(organizationId, { referredBy = null } = {}) {
  const organizationName =
    organizationId.charAt(0).toUpperCase() + organizationId.slice(1).replace(/-/g, " ");
  return {
    organizationId,
    organizationName,
    organizationDescription: `Welcome to ${organizationName}`,
    primaryColor: "#1565c0",
    useCaptcha: true,
    allowAnonymousIdeas: false,
    requireApproval: true,
    enablePwaPrompt: false,
    allowSelfRegistration: true,
    domainRestrictionMode: "none",
    allowedDomains: [],
    blockedDomains: [],
    ...(referredBy != null && { referredBy }),
  };
}

/**
 * Resolve the referral code that attributes a conversion to a consultant.
 *
 * Precedence:
 *   1. An explicit code typed at conversion always wins (#816 behaviour).
 *   2. Phase 2d (#849): a self-serve user supplied a code at registration
 *      (stored on User.referredByConsultantCode, Phase 2a) but did not
 *      re-type it at conversion. Recover it so the existing monthly
 *      commissionJob -- which keys solely off Organization.referredBy --
 *      still credits the referring consultant. Without this the consultant
 *      is silently never paid (the #735 / #815-criterion-2 loss class).
 *      Identity: prefer an authenticated non-demo req.user; otherwise match
 *      the self-asserted adminEmail (verified later by the Stripe payment;
 *      emails are stored lowercased+trimmed at /auth/register).
 *
 * Always best-effort: any error returns null and never blocks the flow.
 * Returns the active Consultant instance (callers read .referralCode for
 * attribution; trial-signup also needs the full row for access grants), or
 * null when there is no usable code.
 */
async function resolveReferralConsultant({ referralCode, req, adminEmail, log, context }) {
  let candidate = null;

  if (referralCode && typeof referralCode === "string" && referralCode.trim().length > 0) {
    candidate = referralCode.trim().toLowerCase();
  } else {
    // Phase 2d fallback: recover the code captured at registration.
    try {
      let user = null;
      if (req?.user && !req.user.isDemo && req.user.id) {
        user = await User.findOne({ where: { id: req.user.id } });
      } else if (adminEmail && typeof adminEmail === "string" && adminEmail.trim().length > 0) {
        user = await User.findOne({
          where: {
            email: adminEmail.trim().toLowerCase(),
            referredByConsultantCode: { [Op.ne]: null },
          },
          order: [["referralCapturedAt", "DESC"]],
        });
      }
      if (user?.referredByConsultantCode) {
        candidate = String(user.referredByConsultantCode).trim().toLowerCase();
        log.info(
          `[Billing] ${context}: recovered referral code from prior registration (Phase 2d)`
        );
      }
    } catch (recoverErr) {
      log.error(`[Billing] ${context}: referral recovery error; ignoring`, {
        message: recoverErr.message,
      });
    }
  }

  if (!candidate) return null;

  // Validate (best-effort) against an active consultant. Same rule as #816.
  try {
    const consultant = await Consultant.findOne({
      where: { referralCode: candidate, isActive: true },
    });
    if (consultant) return consultant;
    log.warn(`[Billing] ${context}: referral code "${candidate}" not found or inactive; ignoring`);
  } catch (refErr) {
    log.error(`[Billing] ${context}: referral code validation error; ignoring`, {
      message: refErr.message,
    });
  }
  return null;
}

/**
 * POST /api/billing/checkout
 * Create a Stripe Checkout Session for new tenant signup
 *
 * Body:
 * - planId: string (sme, pro, enterprise)
 * - orgIdDesired: string (desired organization ID)
 * - billingInterval: string (monthly, yearly) - optional, defaults to monthly
 *
 * Returns:
 * - sessionUrl: string (Stripe Checkout URL)
 * - sessionId: string (Stripe Checkout Session ID)
 */
publicRouter.post(
  "/checkout",
  checkoutLimiter,
  auditLogger({
    action: "billing.checkout.start",
    resourceType: "billing",
    captureBody: true,
    requireAuth: false,
  }),
  async (req, res) => {
    const log = createLogger(req);
    try {
      const {
        planId,
        orgIdDesired,
        adminEmail,
        billingInterval = "monthly",
        referralCode,
      } = req.body;

      // Issue #729 (email-ownership verification): adminEmail is passed to Stripe as customer_email
      // but is not verified to be owned by the submitter. Decision: Stripe Checkout payment friction
      // is the de-facto barrier while a credit card is required for signup. When a free trial without
      // card ships (#531) this decision must be revisited and OTP verification added before provisioning.

      log.info(
        `[Billing] Checkout request - planId: ${planId}, orgIdDesired: ${orgIdDesired}, adminEmail: ${adminEmail}, interval: ${billingInterval}`
      );

      // Issue #816 + Phase 2d (#849): resolve the referral code best-effort.
      // An explicit code typed at checkout wins; otherwise recover the one
      // captured at the converting user's registration. Silently ignored if
      // invalid/inactive; never blocks checkout.
      const validatedConsultant = await resolveReferralConsultant({
        referralCode,
        req,
        adminEmail,
        log,
        context: "Checkout",
      });
      const validatedReferralCode = validatedConsultant?.referralCode ?? null;

      // Validate required fields
      if (!planId) {
        return res.status(400).json({
          error: "Plan ID is required",
          code: "MISSING_PLAN_ID",
        });
      }

      if (!orgIdDesired) {
        return res.status(400).json({
          error: "Desired organization ID is required",
          code: "MISSING_ORG_ID",
        });
      }

      // Validate orgIdDesired format and reserved names
      const validation = validateOrganizationId(orgIdDesired);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error,
          code: "INVALID_ORG_ID",
          field: "orgIdDesired",
          provided: orgIdDesired,
        });
      }

      const sanitizedOrganizationId = validation.sanitized;

      // Check if organizationId is already taken
      const existingTenant = await platformSequelize.query(
        "SELECT id, org_id FROM tenants WHERE org_id = :organizationId",
        {
          replacements: { organizationId: sanitizedOrganizationId },
          type: QueryTypes.SELECT,
        }
      );

      if (existingTenant.length > 0) {
        return res.status(409).json({
          error: `Organization ID "${sanitizedOrganizationId}" is already taken. Please choose a different ID.`,
          code: "ORG_ID_TAKEN",
          field: "orgIdDesired",
        });
      }

      // Validate plan exists in pricing_plans
      const pricingPlan = await platformSequelize.query(
        "SELECT id, plan_code, plan_name, monthly_price, yearly_price, stripe_monthly_price_id, stripe_yearly_price_id FROM pricing_plans WHERE plan_code = :planId AND is_active = true",
        {
          replacements: { planId },
          type: QueryTypes.SELECT,
        }
      );

      if (pricingPlan.length === 0) {
        return res.status(400).json({
          error: `Invalid plan ID: ${planId}`,
          code: "INVALID_PLAN_ID",
          availablePlans: ["sme", "pro", "enterprise"],
        });
      }

      const plan = pricingPlan[0];

      // All plans now require Stripe checkout - no free tier

      // Determine which Stripe Price ID to use
      const stripePriceId =
        billingInterval === "yearly" ? plan.stripe_yearly_price_id : plan.stripe_monthly_price_id;

      if (!stripePriceId || stripePriceId.includes("placeholder")) {
        return res.status(500).json({
          error: "Stripe is not configured for this plan. Please contact support.",
          code: "STRIPE_NOT_CONFIGURED",
        });
      }

      // Create Stripe Checkout Session
      const sessionConfig = {
        mode: "subscription",

        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL}/org/${sanitizedOrganizationId}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/signup?cancelled=true`,
        client_reference_id: sanitizedOrganizationId,
        // org_id is the binding key consumed by GET /checkout-session/:sessionId (#535).
        metadata: {
          org_id: sanitizedOrganizationId,
          plan_id: plan.plan_code,
          billing_interval: billingInterval,
          admin_email: adminEmail || "",
          referral_code: validatedReferralCode || "",
        },
        subscription_data: {
          metadata: {
            org_id: sanitizedOrganizationId,
            plan_id: plan.plan_code,
          },
        },
      };

      // Add customer_email if provided
      if (adminEmail) {
        sessionConfig.customer_email = adminEmail;
      }

      // No Stripe idempotency key. Duplicate-provisioning protection is handled
      // by the org-slug uniqueness check above (409 if taken). An org-scoped
      // key would return a stale or expired session on any retry within 24 hours.
      const session = await stripe.checkout.sessions.create(sessionConfig);

      log.info(
        `[Billing] Checkout session created: ${session.id} for org: ${sanitizedOrganizationId}`
      );

      res.json({
        sessionUrl: session.url,
        sessionId: session.id,
        plan: plan.plan_code,
        orgId: sanitizedOrganizationId,
      });
    } catch (error) {
      // StripeConnectionError = SDK could not reach Stripe (DNS/TLS/timeout) → 503.
      // StripeAPIError is Stripe's catch-all for their own 5xx responses; treat as 500,
      // not 503, to avoid conflating "Stripe is down" with "our connection to Stripe failed".
      if (error?.type === "StripeConnectionError") {
        log.error("[Billing] Stripe unreachable during checkout:", {
          type: error.type,
          message: error.message,
        });
        return res.status(503).json({
          error: "Payment service unavailable. Please try again shortly.",
          code: "STRIPE_UNAVAILABLE",
        });
      }
      // Guard on Stripe type prefix to avoid misclassifying DB errors that happen
      // to carry a statusCode (e.g. from http-errors middleware).
      if (error?.type?.startsWith("Stripe") && error?.type === "StripeInvalidRequestError") {
        log.warn("[Billing] Stripe invalid request during checkout:", {
          type: error.type,
          message: error.message,
        });
        return res.status(422).json({
          error: "Checkout could not be processed. Please check your details and try again.",
          code: "CHECKOUT_CLIENT_ERROR",
          details: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
      log.error("[Billing] Checkout error:", error);
      res.status(500).json({
        error: "Failed to create checkout session",
        code: "CHECKOUT_ERROR",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * GET /api/billing/plans
 * Get available pricing plans
 *
 * Returns:
 * - plans: Array of pricing plan objects
 */
publicRouter.get("/plans", async (req, res) => {
  const log = createLogger(req);
  try {
    const plans = await platformSequelize.query(
      `SELECT
        plan_code,
        plan_name,
        description,
        monthly_price,
        yearly_price,
        currency,
        limits,
        features,
        is_public
      FROM pricing_plans
      WHERE is_active = true AND is_public = true
      ORDER BY monthly_price ASC`,
      {
        type: QueryTypes.SELECT,
      }
    );

    // Issue #710: response is identical for all anonymous callers and changes
    // only when an admin edits a plan, so make it cacheable. 5 min browser
    // cache, 10 min CDN cache. Worst-case staleness on a price edit is
    // bounded by max-age, acceptable for non-real-time pricing data.
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    res.json({ plans });
  } catch (error) {
    log.error("[Billing] Error fetching plans:", error);
    res.status(500).json({
      error: "Failed to fetch pricing plans",
      code: "PLANS_FETCH_ERROR",
    });
  }
});

/**
 * POST /api/billing/trial-signup (#531)
 * Create a new organisation on a 14-day free trial; no credit card required.
 *
 * Body:
 *   orgIdDesired  string  desired org slug
 *   adminUsername string  admin username
 *   adminEmail    string  admin email address
 *   adminPassword string  admin password (min 8 chars)
 *
 * Returns:
 *   token         string  JWT access token
 *   user          object  { id, username, email, organizationId, trialEndsAt }
 */
publicRouter.post(
  "/trial-signup",
  checkoutLimiter,
  auditLogger({
    action: "billing.trial.signup",
    resourceType: "billing",
    captureBody: true,
    requireAuth: false,
  }),
  async (req, res) => {
    const log = createLogger(req);
    try {
      const {
        orgIdDesired,
        adminUsername,
        adminEmail,
        adminPassword,
        recaptchaToken,
        referralCode,
        referralConsent,
      } = req.body;

      if (!recaptchaToken) {
        return res.status(400).json({
          error: "reCAPTCHA token is required.",
          code: "RECAPTCHA_REQUIRED",
        });
      }
      try {
        const captchaResult = await verifyRecaptcha(recaptchaToken, req.ip);
        if (!captchaResult.success) {
          return res.status(400).json({
            error: "reCAPTCHA verification failed.",
            code: "RECAPTCHA_FAILED",
          });
        }
      } catch (captchaErr) {
        if (captchaErr.statusCode === 503) {
          return res.status(503).json({
            error: "reCAPTCHA is not configured on the server.",
            code: "RECAPTCHA_NOT_CONFIGURED",
          });
        }
        log.error("[Billing] reCAPTCHA verify error:", { message: captchaErr.message });
        return res.status(400).json({
          error: "reCAPTCHA verification could not be completed.",
          code: "RECAPTCHA_ERROR",
        });
      }

      if (!orgIdDesired || !adminUsername || !adminEmail || !adminPassword) {
        return res.status(400).json({
          error: "orgIdDesired, adminUsername, adminEmail, and adminPassword are all required.",
          code: "MISSING_FIELDS",
        });
      }

      if (!isEmail(adminEmail)) {
        return res.status(400).json({
          error: "adminEmail must be a valid email address.",
          code: "INVALID_EMAIL",
        });
      }

      if (adminPassword.length < 8) {
        return res.status(400).json({
          error: "Password must be at least 8 characters.",
          code: "PASSWORD_TOO_SHORT",
        });
      }

      const validation = validateOrganizationId(orgIdDesired);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error,
          code: "INVALID_ORG_ID",
          field: "orgIdDesired",
          provided: orgIdDesired,
        });
      }

      const sanitizedOrgId = validation.sanitized;

      const existing = await platformSequelize.query(
        "SELECT id FROM tenants WHERE org_id = :orgId",
        { replacements: { orgId: sanitizedOrgId }, type: QueryTypes.SELECT }
      );
      if (existing.length > 0) {
        return res.status(409).json({
          error: `Organisation ID "${sanitizedOrgId}" is already taken.`,
          code: "ORG_ID_TAKEN",
          field: "orgIdDesired",
        });
      }

      // Fetch pro-level limits from the trial pricing plan.
      const planRows = await platformSequelize.query(
        "SELECT limits FROM pricing_plans WHERE plan_code = 'trial'",
        { type: QueryTypes.SELECT }
      );
      const trialLimits = planRows[0]?.limits ?? {
        maxIdeas: 500,
        maxUsers: 50,
        maxStorage: 5368709120,
      };

      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      // Referral best-effort (#816 pattern) + Phase 2d (#849): an explicit
      // code typed at signup wins; otherwise recover the one captured at the
      // converting user's registration. Invalid/missing never blocks signup.
      // validatedConsultant is also used below for consultant access grants
      // and notifications, so the full row is resolved here.
      const validatedConsultant = await resolveReferralConsultant({
        referralCode,
        req,
        adminEmail,
        log,
        context: "Trial signup",
      });

      const validatedReferralCode = validatedConsultant?.referralCode ?? null;

      // 1. Create platform tenant. Everything after this point must clean up the
      //    tenant row on failure -- the org slug would otherwise be permanently
      //    claimed even though no usable account was created (H1).
      await platformSequelize.query(
        `INSERT INTO tenants (org_id, tenant_name, plan, status, limits, trial_ends_at, created_at, updated_at)
       VALUES (:orgId, :tenantName, 'trial', 'trial', :limits, :trialEndsAt, NOW(), NOW())`,
        {
          replacements: {
            orgId: sanitizedOrgId,
            tenantName:
              sanitizedOrgId.charAt(0).toUpperCase() + sanitizedOrgId.slice(1).replace(/-/g, " "),
            limits: JSON.stringify(trialLimits),
            trialEndsAt,
          },
          type: QueryTypes.INSERT,
        }
      );

      const tenantRows = await platformSequelize.query(
        "SELECT id FROM tenants WHERE org_id = :orgId",
        { replacements: { orgId: sanitizedOrgId }, type: QueryTypes.SELECT }
      );
      const tenantId = tenantRows[0]?.id;
      if (!tenantId) throw new Error("Tenant created but ID not found");

      // Helper: remove the platform tenant row so the slug is not permanently
      // claimed when a later step fails.
      const rollbackTenant = async () => {
        try {
          await platformSequelize.query(
            "DELETE FROM tenants WHERE org_id = :orgId AND status = 'trial'",
            { replacements: { orgId: sanitizedOrgId }, type: QueryTypes.DELETE }
          );
          log.info(`[Billing] Trial signup rollback: tenant row removed for ${sanitizedOrgId}`);
        } catch (rollbackErr) {
          log.error(`[Billing] Trial signup rollback failed for ${sanitizedOrgId}:`, rollbackErr);
        }
      };

      // 2. Create Organisation record in app DB.
      const orgDefaults = buildOrgDefaults(sanitizedOrgId, { referredBy: validatedReferralCode });
      const orgName = orgDefaults.organizationName;
      try {
        await Organization.create(orgDefaults);
      } catch (orgErr) {
        await rollbackTenant();
        throw orgErr;
      }

      // 3. Create admin user under RLS tenant context.
      const passwordHash = await hashPassword(adminPassword);
      let newUser;
      try {
        await withTenantContext(tenantId, async () => {
          newUser = await User.create({
            username: adminUsername,
            passwordHash,
            email: adminEmail,
            isAdmin: true,
            isAnonymous: false,
            organizationId: sanitizedOrgId,
            tenant_id: tenantId,
          });
        });
      } catch (userErr) {
        await rollbackTenant();
        // Username collision: return a user-facing 409 rather than a generic 500 (H2).
        if (userErr instanceof UniqueConstraintError) {
          return res.status(409).json({
            error: `Username "${adminUsername}" is already taken. Please choose a different username.`,
            code: "USERNAME_TAKEN",
            field: "adminUsername",
          });
        }
        throw userErr;
      }

      // 4. Issue JWT (static imports; no dynamic import needed).
      const { token, jti: accessJti } = generateToken(newUser.id, sanitizedOrgId);
      await createSession(accessJti, newUser.id, sanitizedOrgId, "access", ACCESS_TOKEN_TTL_MS);

      // 5. Send welcome email (best-effort; don't fail the signup if it errors).
      enqueueTemplateEmail({
        to: adminEmail,
        subject: "Your Business Review 360 free trial has started",
        template: TrialWelcome,
        templateProps: {
          adminName: adminUsername,
          adminEmail,
          organizationId: sanitizedOrgId,
          organizationName: orgName,
          trialEndsAt: trialEndsAt.toISOString(),
          appUrl: process.env.FRONTEND_URL || "https://br360.example.com",
        },
        type: "trial_welcome",
        priority: EmailPriority.HIGH,
        organizationId: sanitizedOrgId,
        userId: newUser.id,
      }).catch((err) => log.error("[Billing] Failed to enqueue TrialWelcome email:", err));

      // 6. Post-signup referral actions (best-effort; each step is individually
      //    wrapped so a failure in one never aborts the signup response).
      if (validatedConsultant) {
        const grantAccess = referralConsent === true;

        // 6a. Create consultant membership when consent is given and the consultant
        //     has a BR360 user account (userId is set after Phase 1 consultant signup).
        if (grantAccess && validatedConsultant.userId) {
          try {
            await withTenantContext(tenantId, async () => {
              await UserOrganizationMembership.create({
                userId: validatedConsultant.userId,
                organizationId: sanitizedOrgId,
                isAdmin: true,
                isApproved: true,
                isHomeOrg: false,
              });
            });
            log.info("[Billing] Consultant membership created", {
              consultantId: validatedConsultant.id,
              organizationId: sanitizedOrgId,
            });
          } catch (membershipErr) {
            log.error("[Billing] Consultant membership creation failed; continuing", {
              message: membershipErr.message,
              consultantId: validatedConsultant.id,
            });
          }
        } else if (grantAccess && !validatedConsultant.userId) {
          log.info("[Billing] Consultant has no BR360 userId yet; skipping membership", {
            consultantId: validatedConsultant.id,
          });
        }

        // 6b. Resolve consultant email. The Consultant model has no email field;
        //     if the consultant has a User account, use that email; otherwise fall
        //     back to the most-recently-used ConsultantInvite with matching name.
        let consultantEmail = null;
        try {
          if (validatedConsultant.userId) {
            const consultantUser = await User.findOne({
              where: { id: validatedConsultant.userId },
            });
            consultantEmail = consultantUser?.email || null;
          }
          if (!consultantEmail) {
            const invite = await ConsultantInvite.findOne({
              where: {
                firstName: validatedConsultant.firstName,
                lastName: validatedConsultant.lastName,
              },
              order: [["usedAt", "DESC"]],
            });
            consultantEmail = invite?.email || null;
          }
        } catch (emailLookupErr) {
          log.error("[Billing] Consultant email lookup failed; skipping notification", {
            message: emailLookupErr.message,
          });
        }

        // 6c. Send notification email to the consultant.
        if (consultantEmail) {
          const orgSubdomainUrl = `https://${sanitizedOrgId}.br360.example.com`;

          if (grantAccess) {
            try {
              await enqueueTemplateEmail({
                to: consultantEmail,
                subject: `${orgName} has joined BR360 and granted you access`,
                template: ConsultantAccessGrantedEmail,
                templateProps: {
                  firstName: validatedConsultant.firstName,
                  orgName,
                  orgSubdomainUrl,
                },
                categories: ["consultant-access-granted"],
                type: "consultant-access-granted",
                priority: EmailPriority.HIGH,
                organizationId: sanitizedOrgId,
              });
              log.info("[Billing] ConsultantAccessGrantedEmail queued", {
                consultantId: validatedConsultant.id,
              });
            } catch (emailErr) {
              log.error("[Billing] ConsultantAccessGrantedEmail enqueue failed; continuing", {
                message: emailErr.message,
              });
            }
          } else {
            try {
              await enqueueTemplateEmail({
                to: consultantEmail,
                subject: `${orgName} has joined BR360 via your referral`,
                template: ConsultantAccessDeclinedEmail,
                templateProps: {
                  firstName: validatedConsultant.firstName,
                  orgName,
                },
                categories: ["consultant-access-declined"],
                type: "consultant-access-declined",
                priority: EmailPriority.HIGH,
                organizationId: sanitizedOrgId,
              });
              log.info("[Billing] ConsultantAccessDeclinedEmail queued", {
                consultantId: validatedConsultant.id,
              });
            } catch (emailErr) {
              log.error("[Billing] ConsultantAccessDeclinedEmail enqueue failed; continuing", {
                message: emailErr.message,
              });
            }
          }
        } else {
          log.info("[Billing] Could not resolve consultant email; skipping referral notification", {
            consultantId: validatedConsultant.id,
          });
        }
      }

      log.info(`[Billing] Trial signup complete for ${sanitizedOrgId}`);

      // Notify owner. Best-effort.
      notifyEvent(`New trial signup: ${sanitizedOrgId}`, `${adminUsername} (${adminEmail})`).catch(
        () => {}
      );

      res.status(201).json({
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          organizationId: sanitizedOrgId,
          isAdmin: true,
          trialEndsAt: trialEndsAt.toISOString(),
        },
      });
    } catch (error) {
      log.error("[Billing] Trial signup error:", error);
      res.status(500).json({
        error: "Failed to create trial account. Please try again.",
        code: "TRIAL_SIGNUP_ERROR",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * POST /api/billing/demo-access (#566)
 * Issue a short-lived (2h) demo JWT for the shared demo-corp org.
 * No authentication required. Email is optional for lead capture.
 *
 * Body:
 *   recaptchaToken  string   reCAPTCHA v3 token (required)
 *   email           string   visitor email for lead capture (optional)
 *
 * Returns:
 *   token           string   2h demo JWT
 *   user            object   { id, username, email, organizationId, isAdmin, isDemo, demoRole }
 *   organizationId  string   'demo-corp'
 */
publicRouter.post(
  "/demo-access",
  checkoutLimiter,
  auditLogger({
    action: "billing.demo.access",
    resourceType: "billing",
    captureBody: false,
    requireAuth: false,
  }),
  async (req, res) => {
    const log = createLogger(req);
    try {
      const { email, recaptchaToken } = req.body;

      if (!recaptchaToken) {
        return res.status(400).json({
          error: "reCAPTCHA token is required.",
          code: "RECAPTCHA_REQUIRED",
        });
      }
      try {
        const captchaResult = await verifyRecaptcha(recaptchaToken, req.ip);
        if (!captchaResult.success) {
          return res.status(400).json({
            error: "reCAPTCHA verification failed.",
            code: "RECAPTCHA_FAILED",
          });
        }
      } catch (captchaErr) {
        if (captchaErr.statusCode === 503) {
          return res.status(503).json({
            error: "reCAPTCHA is not configured on the server.",
            code: "RECAPTCHA_NOT_CONFIGURED",
          });
        }
        log.error("[Billing] Demo reCAPTCHA error:", { message: captchaErr.message });
        return res.status(400).json({
          error: "reCAPTCHA verification could not be completed.",
          code: "RECAPTCHA_ERROR",
        });
      }

      const visitorEmail = email?.trim().toLowerCase() || null;

      if (visitorEmail) {
        const leadInbox = process.env.LEAD_CAPTURE_EMAIL;
        if (leadInbox) {
          enqueueTemplateEmail({
            to: leadInbox,
            subject: `New demo lead: ${visitorEmail}`,
            template: DemoLeadCapture,
            templateProps: {
              visitorEmail,
              submittedAt: new Date().toISOString(),
            },
            type: "demo_lead",
            priority: EmailPriority.HIGH,
            organizationId: "demo-corp",
          }).catch((err) => log.error("[Billing] Demo lead email failed:", err));
        }
      }

      const { token, user } = generateDemoToken("user", visitorEmail);

      log.info("[Billing] Demo access issued", { hasEmail: !!visitorEmail });

      res.status(201).json({ token, user, organizationId: "demo-corp" });
    } catch (error) {
      log.error("[Billing] Demo access error:", error);
      res.status(500).json({
        error: "Failed to start demo. Please try again.",
        code: "DEMO_ACCESS_ERROR",
      });
    }
  }
);

/**
 * POST /api/billing/demo-switch-role (#566)
 * Swap the demo visitor's role between 'user' and 'admin'.
 * Requires a valid demo JWT (demo: true in payload).
 *
 * Body:
 *   demoRole  'user' | 'admin'
 *
 * Returns:
 *   token  string   new 2h demo JWT with updated role
 *   user   object   updated user object
 */
protectedRouter.post(
  "/demo-switch-role",
  auditLogger({ action: "billing.demo.switchRole", resourceType: "billing", requireAuth: true }),
  async (req, res) => {
    const log = createLogger(req);
    if (!req.user?.isDemo) {
      return res.status(403).json({
        error: "Role switching is only available in demo mode.",
        code: "NOT_DEMO_USER",
      });
    }
    const requestedRole = req.body?.demoRole === "admin" ? "admin" : "user";
    const { token, user } = generateDemoToken(requestedRole, req.user.visitorEmail);
    log.info("[Billing] Demo role switched", { from: req.user.demoRole, to: requestedRole });
    res.json({ token, user });
  }
);

/**
 * GET /api/billing/usage
 * Get current usage and limits for authenticated tenant
 *
 * Returns:
 * - usage: { ideas, users, storage }
 * - limits: { maxIdeas, maxUsers, maxStorage }
 * - plan: string
 */
protectedRouter.get(
  "/usage",
  auditLogger({ action: "billing.usage.view", resourceType: "billing" }),
  requireSameOrganization,
  async (req, res) => {
    const log = createLogger(req);
    try {
      // This route needs tenant context from URL or user
      const organizationId = req.query.organizationId || req.user?.organizationId;

      if (!organizationId) {
        return res.status(400).json({
          error: "Organization ID required",
          code: "MISSING_ORG_ID",
        });
      }

      // Get tenant from platform DB.
      // transaction: null opts out of any CLS-threaded app-DB transaction so
      // the platform DB query runs on its own connection, not the app-DB
      // transaction opened by wrapTenantTransaction.
      const tenants = await platformSequelize.query(
        "SELECT id, org_id, tenant_name, plan, limits FROM tenants WHERE org_id = :organizationId",
        {
          replacements: { organizationId },
          type: QueryTypes.SELECT,
          transaction: null,
        }
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          error: "Organisation not found",
          code: "ORG_NOT_FOUND",
        });
      }

      const tenant = tenants[0];

      const usage = await getTenantUsage(tenant.id);

      // Default limits when the platform DB row pre-dates the limits column.
      const DEFAULT_LIMITS = { maxIdeas: 100, maxUsers: 10, maxStorage: 1073741824 };

      res.json({
        usage,
        limits: tenant.limits ?? DEFAULT_LIMITS,
        plan: tenant.plan,
        orgId: tenant.org_id,
        tenantName: tenant.tenant_name,
      });
    } catch (error) {
      log.error("[Billing] Error fetching usage:", error);
      res.status(500).json({
        error: "Failed to fetch usage stats",
        code: "USAGE_FETCH_ERROR",
      });
    }
  }
);

/**
 * GET /api/billing/checkout-session/:sessionId
 * Verify a checkout session after payment completion
 */
protectedRouter.get(
  "/checkout-session/:sessionId",
  auditLogger({ action: "billing.checkout.status", resourceType: "billing", requireAuth: true }),
  async (req, res) => {
    const log = createLogger(req);
    try {
      const { sessionId } = req.params;

      // Retrieve the session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Issue #535: enforce org binding via Stripe metadata.org_id.
      // Sessions without the binding key cannot be safely served (Decision 2).
      const sessionOrgId = session.metadata?.org_id;
      if (!sessionOrgId) {
        log.warn(
          `[Billing] Session ${sessionId} missing metadata.org_id; rejecting (caller org: ${req.user.organizationId})`
        );
        return res.status(403).json({
          error: "Session not bound to an organisation",
          code: "SESSION_NOT_BOUND",
        });
      }
      if (sessionOrgId !== req.user.organizationId) {
        log.warn(
          `[Billing] Session ${sessionId} org mismatch: caller=${req.user.organizationId}, session=${sessionOrgId}`
        );
        return res.status(403).json({
          error: "Session belongs to a different organisation",
          code: "SESSION_ORG_MISMATCH",
        });
      }

      // Return relevant session information
      res.json({
        success: true,
        orgId: sessionOrgId,
        plan: session.metadata?.plan_id,
        billingInterval: session.metadata?.billing_interval,
        status: session.payment_status,
        customerEmail: session.customer_details?.email,
      });
    } catch (error) {
      if (error?.statusCode === 404) {
        return res
          .status(404)
          .json({ error: "Checkout session not found", code: "SESSION_NOT_FOUND" });
      }
      log.error("[Billing] Error retrieving checkout session:", error);
      res.status(500).json({
        error: "Failed to retrieve checkout session",
        code: "SESSION_RETRIEVE_ERROR",
      });
    }
  }
);

/**
 * POST /api/billing/customer-portal
 * Create a Stripe Customer Portal session for subscription management
 *
 * This allows customers to:
 * - Upgrade/downgrade subscription plans
 * - Switch between monthly and yearly billing
 * - Cancel their subscription
 * - Update payment method
 * - View and download invoices
 * - Update billing details
 *
 * Note: Plan switching must be enabled in Stripe Dashboard:
 * https://dashboard.stripe.com/settings/billing/portal
 *
 * Requires authentication and active subscription
 *
 * Body:
 * - returnUrl: string (URL to return to after portal session)
 *
 * Returns:
 * - url: string (Stripe Customer Portal URL)
 */
protectedRouter.post(
  "/customer-portal",
  auditLogger({
    action: "billing.customer-portal.start",
    resourceType: "billing",
    captureBody: true,
  }),
  requireSameOrganization,
  async (req, res) => {
    const log = createLogger(req);
    try {
      const { returnUrl: rawReturnUrl } = req.body;
      const organizationId = req.body.organizationId || req.user?.organizationId;

      // #820: validate returnUrl against known BR360 origins to prevent an
      // authenticated user from crafting a portal session that redirects to a
      // phishing domain after the user completes a billing action on Stripe.
      // #820 hardening: compare the PARSED origin exactly. The previous
      // rawReturnUrl.startsWith(o) check was bypassable -- an allowed
      // origin is a string prefix of a malicious look-alike host, so
      // https://br360.example.com.attacker.com/... passed it.
      // Normalise the allowlist to origins too (FRONTEND_URL may carry a
      // path/trailing slash) so the comparison is origin-to-origin.
      const allowedOrigins = [process.env.FRONTEND_URL, "https://br360.example.com"]
        .filter(Boolean)
        .map((o) => {
          try {
            return new URL(o).origin;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const returnUrl = (() => {
        if (!rawReturnUrl) return null;
        try {
          const parsed = new URL(rawReturnUrl);
          return allowedOrigins.includes(parsed.origin) ? rawReturnUrl : null;
        } catch {
          return null;
        }
      })();

      log.info(`[Billing] Customer portal request for organizationId: ${organizationId}`);

      if (!organizationId) {
        return res.status(400).json({
          error: "Organization ID required",
          code: "MISSING_ORG_ID",
        });
      }

      // Get tenant from platform DB
      const tenants = await platformSequelize.query(
        "SELECT id, org_id FROM tenants WHERE org_id = :organizationId",
        {
          replacements: { organizationId },
          type: QueryTypes.SELECT,
        }
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          error: "Organization not found",
          code: "ORG_NOT_FOUND",
        });
      }

      const tenant = tenants[0];

      // Get Stripe customer ID for this tenant
      const customers = await platformSequelize.query(
        "SELECT stripe_customer_id FROM stripe_customers WHERE tenant_id = :tenantId LIMIT 1",
        {
          replacements: { tenantId: tenant.id },
          type: QueryTypes.SELECT,
        }
      );

      if (customers.length === 0) {
        return res.status(404).json({
          error: "No subscription found for this organization",
          code: "NO_SUBSCRIPTION",
          message: "You need an active subscription to access the customer portal",
        });
      }

      const stripeCustomerId = customers[0].stripe_customer_id;

      // Create Stripe Customer Portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl || `${process.env.FRONTEND_URL}/org/${organizationId}/admin`,
      });

      log.info(`[Billing] Customer portal session created for customer: ${stripeCustomerId}`);

      res.json({
        url: portalSession.url,
      });
    } catch (error) {
      log.error("[Billing] Customer portal error:", error);
      res.status(500).json({
        error: "Failed to create customer portal session",
        code: "PORTAL_ERROR",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * POST /api/billing/webhook
 *
 * NOTE: Webhook route is now handled directly in index.js BEFORE any body parsing middleware.
 * This ensures the raw body is available for Stripe signature verification.
 *
 * The handler functions below are exported and called from index.js.
 */

// Export webhook processing function for use in index.js
export async function processWebhookEvent(event) {
  try {
    // Log the event to stripe_events table (idempotency)
    const eventExists = await platformSequelize.query(
      "SELECT id FROM stripe_events WHERE id = :eventId",
      {
        replacements: { eventId: event.id },
        type: QueryTypes.SELECT,
      }
    );

    if (eventExists.length > 0) {
      logger.info(`[Billing] Event ${event.id} already processed, skipping`);
      return { received: true, skipped: true };
    }

    // Claim the event atomically. ON CONFLICT (id) DO NOTHING handles the race
    // window where Stripe delivers the same event concurrently to two workers.
    // RETURNING id comes back empty when the row already existed, so we skip.
    const claimed = await platformSequelize.query(
      `INSERT INTO stripe_events (id, type, payload, processed, processed_at)
       VALUES (:eventId, :eventType, :eventData, true, NOW())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      {
        replacements: {
          eventId: event.id,
          eventType: event.type,
          eventData: JSON.stringify(event.data.object),
        },
        type: QueryTypes.SELECT,
      }
    );

    if (claimed.length === 0) {
      logger.info(`[Billing] Event ${event.id} already processed (concurrent delivery), skipping`);
      return { received: true, skipped: true };
    }

    // Handle different event types. Wrapped in a try/catch so that a handler
    // exception removes the claim row, allowing Stripe's retry to reprocess.
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object);
          break;

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object);
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(event.data.object);
          break;

        case "charge.dispute.created":
        case "charge.dispute.funds_withdrawn":
          logger.error("[Billing] DISPUTE: manual action required in Stripe dashboard", {
            disputeId: event.data.object.id,
            amount: event.data.object.amount,
            currency: event.data.object.currency,
            reason: event.data.object.reason,
            status: event.data.object.status,
            chargeId: event.data.object.charge,
            evidenceDueBy: event.data.object.evidence_details?.due_by
              ? new Date(event.data.object.evidence_details.due_by * 1000).toISOString()
              : null,
          });
          break;

        case "charge.dispute.closed":
          logger.info("[Billing] Dispute closed", {
            disputeId: event.data.object.id,
            status: event.data.object.status,
          });
          break;

        case "charge.refunded": {
          const charge = event.data.object;
          const latestRefund = charge.refunds?.data?.[0];
          logger.warn(
            "[Billing] Charge refunded: review whether tenant access should be affected",
            {
              chargeId: charge.id,
              customerId: charge.customer,
              amountRefundedCents: charge.amount_refunded,
              currency: charge.currency,
              refundId: latestRefund?.id ?? null,
              refundReason: latestRefund?.reason ?? null,
              refundStatus: latestRefund?.status ?? null,
            }
          );
          break;
        }

        default:
          logger.info(`[Billing] Unhandled event type: ${event.type}`);
      }
    } catch (handlerError) {
      // Unclaim the event so Stripe's retry can reprocess it. If this DELETE
      // also fails (DB is down), we rethrow anyway so the webhook returns non-2xx
      // and Stripe retries regardless.
      try {
        await platformSequelize.query("DELETE FROM stripe_events WHERE id = :eventId", {
          replacements: { eventId: event.id },
          type: QueryTypes.DELETE,
        });
        logger.warn(`[Billing] Handler failed for event ${event.id}; claim removed for retry`, {
          message: handlerError.message,
        });
      } catch (deleteError) {
        logger.error(`[Billing] Failed to remove claim for event ${event.id}:`, deleteError);
      }
      throw handlerError;
    }

    return { received: true };
  } catch (error) {
    logger.error(`[Billing] Webhook processing error:`, error);
    throw error;
  }
}

/**
 * Handle checkout.session.completed event
 * Creates tenant, customer, and subscription records
 */
async function handleCheckoutCompleted(session) {
  logger.info(`[Billing] Processing checkout.session.completed: ${session.id}`);

  const organizationId = session.metadata.org_id || session.client_reference_id;
  const planId = session.metadata.plan_id;
  const rawReferralCode = session.metadata.referral_code || null;

  // Re-validate the referral code at fulfilment time; the code must still be
  // active when the subscription is actually created (best-effort; if the DB is
  // unreachable at this point, proceed without attribution rather than failing
  // tenant provisioning).
  let webhookReferralCode = null;
  if (rawReferralCode) {
    try {
      const consultant = await Consultant.findOne({
        where: { referralCode: rawReferralCode, isActive: true },
      });
      webhookReferralCode = consultant?.referralCode ?? null;
      if (!webhookReferralCode) {
        logger.warn(
          `[Billing] handleCheckoutCompleted: referral code "${rawReferralCode}" inactive at fulfilment; skipping attribution`
        );
      }
    } catch (refErr) {
      logger.error(
        "[Billing] handleCheckoutCompleted: referral code re-validation failed; skipping attribution",
        { message: refErr.message }
      );
    }
  }

  if (!organizationId || !planId) {
    logger.error("[Billing] Missing org_id or plan_id in session metadata");
    return;
  }

  // Idempotency is per-step, not whole-handler (#932). The old tenant-exists
  // early return made a Stripe retry a no-op the moment the tenants row
  // existed, so a crash or failure after that insert left a paying customer
  // half-provisioned with no automated repair path. Each step below now
  // checks or upserts its own state, so re-running the whole handler is safe
  // and a retry completes whatever the previous attempt did not.
  const existingTenant = await platformSequelize.query(
    "SELECT id FROM tenants WHERE org_id = :organizationId",
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    }
  );

  if (existingTenant.length > 0) {
    logger.info(`[Billing] Tenant ${organizationId} already exists, skipping tenant insert`);

    // #966 slug TOCTOU guard. Availability is checked at session creation,
    // but two checkout sessions for the same orgIdDesired opened inside the
    // window can both be paid. If this tenant already belongs to a DIFFERENT
    // Stripe customer, this event is the losing side of that race: attaching
    // this customer's subscription to someone else's tenant (and welcoming
    // them to an org they do not control) would be silent damage. Stop,
    // alert for a manual refund, and mark the event processed (a retry can
    // never win this race, so unclaiming would only re-alert hourly).
    if (session.customer) {
      const owners = await platformSequelize.query(
        "SELECT stripe_customer_id FROM stripe_customers WHERE tenant_id = (SELECT id FROM tenants WHERE org_id = :organizationId)",
        { replacements: { organizationId }, type: QueryTypes.SELECT }
      );
      const ownedByOther =
        owners.length > 0 && !owners.some((o) => o.stripe_customer_id === session.customer);
      if (ownedByOther) {
        logger.error(
          `[Billing] Checkout session ${session.id} paid for org ${organizationId} already owned by another customer; provisioning skipped, manual refund required`,
          { sessionCustomer: session.customer }
        );
        notifyError(
          "[BR360] Checkout conflict: org slug already taken by another customer",
          `Session ${session.id} (customer ${session.customer}) paid for "${organizationId}" but that org belongs to a different Stripe customer.\n` +
            `Nothing was provisioned and no welcome email was sent. Refund the charge in the Stripe dashboard and contact the buyer.`,
          { priority: 5 }
        ).catch(() => {});
        return;
      }
    }
  } else {
    // Get plan limits. A missing plan is a configuration error (plan codes
    // come from our own checkout creation): throw so the event unclaims and
    // Stripe retries loudly, rather than silently skipping provisioning for
    // a customer who has paid.
    const plan = await platformSequelize.query(
      "SELECT limits FROM pricing_plans WHERE plan_code = :planId",
      {
        replacements: { planId },
        type: QueryTypes.SELECT,
      }
    );

    if (plan.length === 0) {
      throw new Error(`[Billing] Plan ${planId} not found while provisioning ${organizationId}`);
    }

    // Create tenant
    await platformSequelize.query(
      `INSERT INTO tenants (org_id, tenant_name, plan, status, limits, created_at, updated_at)
       VALUES (:organizationId, :tenantName, :plan, 'active', :limits, NOW(), NOW())
       ON CONFLICT (org_id) DO NOTHING`,
      {
        replacements: {
          organizationId,
          tenantName: organizationId.charAt(0).toUpperCase() + organizationId.slice(1), // Capitalize first letter
          plan: planId,
          limits: JSON.stringify(plan[0].limits),
        },
        type: QueryTypes.INSERT,
      }
    );

    logger.info(`[Billing] Tenant created: ${organizationId}`);
  }

  // Get the tenant_id we just created
  const tenant = await platformSequelize.query(
    "SELECT id FROM tenants WHERE org_id = :organizationId",
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    }
  );

  const tenantId = tenant[0]?.id;

  // Create Stripe customer record
  if (session.customer && tenantId) {
    await platformSequelize.query(
      `INSERT INTO stripe_customers (stripe_customer_id, tenant_id, email, name, created_at, updated_at)
       VALUES (:customerId, :tenantId, :email, :name, NOW(), NOW())
       ON CONFLICT (stripe_customer_id) DO NOTHING`,
      {
        replacements: {
          customerId: session.customer,
          tenantId,
          email: session.customer_details?.email || null,
          name: session.customer_details?.name || null,
        },
        type: QueryTypes.INSERT,
      }
    );

    logger.info(`[Billing] Stripe customer record created: ${session.customer}`);
  }

  // Create subscription record
  if (session.subscription && tenantId) {
    const billingInterval = session.metadata?.billing_interval || "monthly";
    const amount = session.amount_total || 0;

    await platformSequelize.query(
      `INSERT INTO stripe_subscriptions (
        tenant_id, stripe_subscription_id, stripe_customer_id, status,
        plan_id, plan_name, billing_interval, amount, currency,
        current_period_start, current_period_end,
        created_at, updated_at
       )
       VALUES (:tenantId, :subscriptionId, :customerId, 'active',
               :planId, :planName, :billingInterval, :amount, :currency,
               NOW(), NOW() + INTERVAL '30 days', NOW(), NOW())
       ON CONFLICT (stripe_subscription_id) DO NOTHING`,
      {
        replacements: {
          tenantId,
          subscriptionId: session.subscription,
          customerId: session.customer,
          planId: planId,
          planName: planId.charAt(0).toUpperCase() + planId.slice(1),
          billingInterval: billingInterval,
          amount: amount,
          currency: session.currency || "aud",
        },
        type: QueryTypes.INSERT,
      }
    );

    logger.info(`[Billing] Subscription record created: ${session.subscription}`);
  }

  // Provision the Organization record in the app database
  // This allows the user to access /org/{orgId} after checkout
  try {
    const existingOrg = await Organization.findOne({
      where: { organizationId },
    });

    if (!existingOrg) {
      const orgDefaults = buildOrgDefaults(organizationId, { referredBy: webhookReferralCode });
      await Organization.create(orgDefaults);

      logger.info(`[Billing] Organization created in app database: ${organizationId}`);
    } else {
      logger.info(`[Billing] Organization ${organizationId} already exists in app database`);
    }
  } catch (orgError) {
    // Rethrow (#932): a swallowed failure here left a paying customer with a
    // tenant but no Organization, /org/{orgId} broken, the event marked
    // processed so Stripe never retried, and only a log line as evidence.
    // Throwing unclaims the event (processWebhookEvent's handler catch), the
    // webhook returns non-2xx, and Stripe's retry re-runs this handler, whose
    // steps are all idempotent, so the retry repairs the missing pieces.
    logger.error(`[Billing] Error creating Organization record:`, orgError);
    throw orgError;
  }

  // Send signup welcome email. Best-effort: do not fail provisioning if this errors.
  const adminEmail = session.metadata?.admin_email || session.customer_details?.email;
  if (adminEmail) {
    const orgName =
      organizationId.charAt(0).toUpperCase() + organizationId.slice(1).replace(/-/g, " ");
    enqueueTemplateEmail({
      to: adminEmail,
      subject: "Welcome to Business Review 360: your account is ready",
      template: SignupWelcome,
      templateProps: {
        adminName: session.customer_details?.name || null,
        organizationId,
        organizationName: orgName,
        planId,
        appUrl: process.env.FRONTEND_URL || "https://br360.example.com",
      },
      type: "signup-welcome",
      priority: EmailPriority.HIGH,
      organizationId,
    }).catch((err) => logger.error("[Billing] Failed to enqueue SignupWelcome email:", err));
  }

  // Notify owner. Best-effort.
  const signupName = session.customer_details?.name;
  const signupFirstName = signupName ? signupName.split(" ")[0] : null;
  const signupEmail = adminEmail || session.customer_details?.email;
  notifyEvent(
    `New paid signup: ${organizationId}`,
    `${signupFirstName || "Unknown"} (${signupEmail || "no email"})\nPlan: ${planId}`
  ).catch(() => {});

  logger.info(`[Billing] Provisioning complete for ${organizationId}`);
}

/**
 * Handle customer.subscription.updated event
 * Updates subscription status in database
 */
async function handleSubscriptionUpdated(subscription) {
  logger.info(`[Billing] Processing customer.subscription.updated: ${subscription.id}`);

  // Validate and convert Unix timestamps to Date objects
  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  // Check if dates are valid
  if (periodStart && isNaN(periodStart.getTime())) {
    logger.error(`[Billing] Invalid current_period_start: ${subscription.current_period_start}`);
    return;
  }
  if (periodEnd && isNaN(periodEnd.getTime())) {
    logger.error(`[Billing] Invalid current_period_end: ${subscription.current_period_end}`);
    return;
  }

  await platformSequelize.query(
    `UPDATE stripe_subscriptions
     SET status = :status,
         current_period_start = :periodStart,
         current_period_end = :periodEnd,
         updated_at = NOW()
     WHERE stripe_subscription_id = :subscriptionId`,
    {
      replacements: {
        subscriptionId: subscription.id,
        status: subscription.status,
        periodStart: periodStart,
        periodEnd: periodEnd,
      },
      type: QueryTypes.UPDATE,
    }
  );

  // Update tenant status based on subscription status
  if (subscription.status === "active") {
    await platformSequelize.query(
      `UPDATE tenants SET status = 'active', updated_at = NOW()
       WHERE org_id = (SELECT org_id FROM stripe_subscriptions WHERE stripe_subscription_id = :subscriptionId)`,
      {
        replacements: { subscriptionId: subscription.id },
        type: QueryTypes.UPDATE,
      }
    );
  } else if (["past_due", "unpaid"].includes(subscription.status)) {
    await platformSequelize.query(
      `UPDATE tenants SET status = 'suspended', updated_at = NOW()
       WHERE org_id = (SELECT org_id FROM stripe_subscriptions WHERE stripe_subscription_id = :subscriptionId)`,
      {
        replacements: { subscriptionId: subscription.id },
        type: QueryTypes.UPDATE,
      }
    );
  }

  logger.info(
    `[Billing] Subscription updated: ${subscription.id} - Status: ${subscription.status}`
  );
}

/**
 * Handle customer.subscription.deleted event
 * Marks tenant as cancelled
 */
async function handleSubscriptionDeleted(subscription) {
  logger.info(`[Billing] Processing customer.subscription.deleted: ${subscription.id}`);

  await platformSequelize.query(
    `UPDATE tenants SET status = 'cancelled', updated_at = NOW()
     WHERE org_id = (SELECT org_id FROM stripe_subscriptions WHERE stripe_subscription_id = :subscriptionId)`,
    {
      replacements: { subscriptionId: subscription.id },
      type: QueryTypes.UPDATE,
    }
  );

  await platformSequelize.query(
    `UPDATE stripe_subscriptions
     SET status = 'canceled', updated_at = NOW()
     WHERE stripe_subscription_id = :subscriptionId`,
    {
      replacements: { subscriptionId: subscription.id },
      type: QueryTypes.UPDATE,
    }
  );

  logger.info(`[Billing] Subscription cancelled: ${subscription.id}`);

  // Notify the customer that their subscription has been cancelled.
  // Joins stripe_customers for the contact email and stripe_subscriptions
  // for the plan/period so the email has real detail. The helper logs
  // and returns gracefully when no email provider is configured.
  try {
    const [customerRow] = await platformSequelize.query(
      `SELECT sc.email AS customer_email,
              sc.name  AS customer_name,
              ss.plan_name,
              ss.current_period_end,
              ss.org_id AS organization_id
         FROM stripe_subscriptions ss
         LEFT JOIN stripe_customers sc
                ON sc.stripe_customer_id = ss.stripe_customer_id
        WHERE ss.stripe_subscription_id = :subscriptionId
        LIMIT 1`,
      {
        replacements: { subscriptionId: subscription.id },
        type: QueryTypes.SELECT,
      }
    );

    const customerEmail = customerRow?.customer_email;

    if (customerEmail) {
      const effectiveDate =
        (subscription.cancel_at && new Date(subscription.cancel_at * 1000).toISOString()) ||
        (subscription.canceled_at && new Date(subscription.canceled_at * 1000).toISOString()) ||
        (customerRow?.current_period_end
          ? new Date(customerRow.current_period_end).toISOString()
          : new Date().toISOString());

      const supportEmail =
        process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || process.env.GMAIL_USER || null;

      const emailResult = await enqueueTemplateEmail({
        to: customerEmail,
        subject: "Your subscription has been cancelled",
        template: SubscriptionCancelled,
        templateProps: {
          customerName: customerRow?.customer_name || null,
          customerEmail,
          planName: customerRow?.plan_name || null,
          effectiveDate,
          supportEmail,
        },
        categories: ["billing", "subscription-cancelled"],
        type: "subscription-cancelled",
        priority: EmailPriority.HIGH,
        organizationId: customerRow?.organization_id || null,
      });

      if (!emailResult.success) {
        logger.warn(
          `[Billing] Cancellation email failed for ${subscription.id}: ${emailResult.error}`
        );
      }
    } else {
      logger.warn(
        `[Billing] No customer email on file for subscription ${subscription.id}; cancellation notification skipped.`
      );
    }
  } catch (emailError) {
    // Do not let email delivery errors affect the webhook response.
    logger.error(`[Billing] Error sending cancellation email for ${subscription.id}:`, emailError);
  }
}

/**
 * Handle invoice.payment_failed event
 * Notifies about failed payment (suspends tenant + emails customer once).
 *
 * Stripe retries failed invoices automatically per the dashboard retry
 * schedule (Smart Retries / dunning). Each retry fires a NEW
 * invoice.payment_failed webhook with a different stripe_event_id but the
 * same invoice.id, with `attempt_count` incrementing on each pass. To keep
 * the customer's inbox sane we send the email only on the first attempt
 * (attempt_count === 1) and log subsequent retries without sending. The
 * tenant suspension UPDATE is idempotent and runs every time so its outcome
 * does not depend on the email path.
 */
async function handlePaymentFailed(invoice) {
  logger.info(`[Billing] Processing invoice.payment_failed: ${invoice.id}`);

  if (!invoice.subscription) {
    return;
  }

  // Suspend the tenant unconditionally on every retry. This is idempotent.
  await platformSequelize.query(
    `UPDATE tenants SET status = 'suspended', updated_at = NOW()
     WHERE org_id = (SELECT org_id FROM stripe_subscriptions WHERE stripe_subscription_id = :subscriptionId)`,
    {
      replacements: { subscriptionId: invoice.subscription },
      type: QueryTypes.UPDATE,
    }
  );

  logger.info(`[Billing] Tenant suspended due to payment failure: ${invoice.subscription}`);

  // Idempotency: Stripe sends one invoice.payment_failed per attempt.
  // attempt_count starts at 1 for the first failure and increments on each
  // retry. Email only on the first attempt; log the skip on retries.
  const attemptCount = invoice.attempt_count;
  if (typeof attemptCount === "number" && attemptCount > 1) {
    logger.info(
      `[Billing] Skipping payment-failure email for invoice ${invoice.id}: retry attempt ${attemptCount} (Stripe will keep retrying automatically).`
    );
    return;
  }

  // Notify the customer that their most recent payment failed. Joins
  // stripe_customers for the contact email and stripe_subscriptions for the
  // plan so the email has real detail. Errors here are caught and never
  // surfaced to the webhook response.
  try {
    const [customerRow] = await platformSequelize.query(
      `SELECT sc.email AS customer_email,
              sc.name  AS customer_name,
              ss.plan_name,
              ss.org_id AS organization_id
         FROM stripe_subscriptions ss
         LEFT JOIN stripe_customers sc
                ON sc.stripe_customer_id = ss.stripe_customer_id
        WHERE ss.stripe_subscription_id = :subscriptionId
        LIMIT 1`,
      {
        replacements: { subscriptionId: invoice.subscription },
        type: QueryTypes.SELECT,
      }
    );

    const customerEmail = customerRow?.customer_email;

    if (!customerEmail) {
      logger.warn(
        `[Billing] No customer email on file for subscription ${invoice.subscription}; payment-failure notification skipped.`
      );
      return;
    }

    const supportEmail =
      process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || process.env.GMAIL_USER || null;

    const portalUrl = process.env.STRIPE_CUSTOMER_PORTAL_URL || null;

    const retryDate = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toISOString()
      : null;

    const emailResult = await enqueueTemplateEmail({
      to: customerEmail,
      subject: "Action required: your payment failed",
      template: PaymentFailed,
      templateProps: {
        customerName: customerRow?.customer_name || null,
        customerEmail,
        planName: customerRow?.plan_name || null,
        retryDate,
        portalUrl,
        supportEmail,
      },
      categories: ["billing", "payment-failed"],
      type: "payment-failed",
      priority: EmailPriority.HIGH,
      organizationId: customerRow?.organization_id || null,
    });

    if (!emailResult.success) {
      logger.warn(
        `[Billing] Payment-failure email failed for ${invoice.subscription}: ${emailResult.error}`
      );
    }
  } catch (emailError) {
    // Do not let email delivery errors affect the webhook response.
    logger.error(
      `[Billing] Error sending payment-failure email for ${invoice.subscription}:`,
      emailError
    );
  }
}
