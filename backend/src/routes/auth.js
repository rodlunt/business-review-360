import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  sendAdminUserPendingApprovalEmail,
  sendMagicLinkEmail,
} from "../services/notificationEmailService.js";
import User from "../models/User.js";
import UserOrganizationMembership from "../models/UserOrganizationMembership.js";
import Organization from "../models/Organization.js";
import MagicLinkToken from "../models/MagicLinkToken.js";
import { validationRules, handleValidationErrors } from "../middleware/security.js";
import { body } from "express-validator";
import { platformSequelize } from "../models/platformDatabase.js";
import { QueryTypes } from "sequelize";
import { formatServerError } from "../utils/formatServerError.js";
import { verifyRecaptcha } from "../lib/recaptcha.js";
import { auditLogger } from "../middleware/auditLog.js";
import { createLogger } from "../utils/logger.js";
import { getTenantByOrganizationId } from "../middleware/tenantResolver.js";
import { notifyEvent, notifyError } from "../utils/ntfy.js";
import { OAUTH_PROVIDERS, getActiveProvidersForOrg } from "../lib/oauthProviders.js";
// Phase 5a (#858) timing-equaliser + work factor, single source of
// truth. passwordHashParity.test.js keeps the dummy hash in lockstep
// with the live Argon2id parameters so drift cannot silently reopen the
// org-less user-enumeration timing oracle.
import {
  hashPassword,
  verifyPassword,
  verifyDummy,
  upgradeHashIfNeeded,
} from "../utils/passwordHash.js";
// Issue #859: per-credential login lockout. clearThrottle is also
// called from the password-reset success path so a reset is the
// documented unlock route for a locked-out legitimate user.
import {
  loginThrottleKey,
  isLocked,
  registerFailure,
  clearThrottle,
} from "../services/loginThrottle.js";

// #720: split into public + protected sub-routers so this file no longer
// imports `authenticate` directly. authenticate is mounted in index.js
// on the protected router. Removing the dynamic-import workaround that
// previously fetched authenticate inside /me at request time.
export const publicRouter = express.Router();
export const protectedRouter = express.Router();
// Keep `router` as an alias for the public router so the bulk of this
// file (which uses router.post(...) for the public endpoints) continues
// to work without rewriting every line. /me is rewritten below to use
// protectedRouter directly.
const router = publicRouter;

// Shared handler for password-reset request. Responds identically for
// registered, unregistered, and anonymous accounts so the endpoint cannot be
// used to enumerate which emails exist (#540). Wired to both
// /request-password-reset and its /recover alias below, so future enumeration
// guards cannot accidentally miss one endpoint.
const requestPasswordResetHandler = async (req, res) => {
  const logger = createLogger(req);
  const { email, recaptchaToken } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const normalizedEmail = email.trim().toLowerCase();
  const genericResponse = {
    success: true,
    message: "If an account exists for that email, password reset instructions have been sent.",
  };

  // Issue #559: verify reCAPTCHA when the frontend attaches a token. On
  // failure, return the generic response so the #540 enumeration guard is
  // not narrowed (a bot must not be able to distinguish captcha failure
  // from "account exists / not exists"). Missing server-side secret returns
  // 503 because a misconfigured server is not an enumeration signal.
  if (recaptchaToken) {
    try {
      const result = await verifyRecaptcha(recaptchaToken, req.ip);
      if (!result.success) {
        return res.json(genericResponse);
      }
    } catch (err) {
      if (err.statusCode === 503) {
        return res.status(503).json({
          error: "reCAPTCHA is not configured on the server",
          code: "RECAPTCHA_NOT_CONFIGURED",
        });
      }
      logger.error("[Password reset] reCAPTCHA verify error:", { message: err.message });
      return res.json(genericResponse);
    }
  }

  try {
    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (user && !user.isAnonymous && user.email && user.organizationId) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 min expiry
      await user.save();

      try {
        await sendPasswordResetEmail(email, rawToken, user.organizationId);
      } catch (mailError) {
        // Swallow mail errors so the response shape cannot be used to
        // enumerate account state. The token is saved; the user can retry.
        logger.error("Password reset email send failed:", mailError);
      }
    }

    return res.json(genericResponse);
  } catch (error) {
    logger.error("Password reset error:", error);
    return res.status(500).json({ error: "Failed to process password reset request" });
  }
};

// Issue #500: single route mounted at both paths. Applying an enumeration or
// rate-limit change touches one declaration, not two.
router.post(
  ["/request-password-reset", "/recover"],
  auditLogger({ action: "auth.password-reset.request", resourceType: "auth", requireAuth: false }),
  [validationRules.email, handleValidationErrors],
  requestPasswordResetHandler
);

// Reset password (for all users)
router.post(
  "/reset-password",
  auditLogger({ action: "auth.password-reset.complete", resourceType: "auth", requireAuth: false }),
  [validationRules.password, handleValidationErrors],
  async (req, res) => {
    const logger = createLogger(req);
    const { token, password, recaptchaToken } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password required" });

    // Issue #559: verify reCAPTCHA when the frontend attaches a token.
    // Reset-password is token-protected, so a captcha failure can surface
    // an explicit RECAPTCHA_FAILED response (no enumeration concern).
    if (recaptchaToken) {
      try {
        const result = await verifyRecaptcha(recaptchaToken, req.ip);
        if (!result.success) {
          return res.status(400).json({
            error: "reCAPTCHA verification failed",
            code: "RECAPTCHA_FAILED",
          });
        }
      } catch (err) {
        if (err.statusCode === 503) {
          return res.status(503).json({
            error: "reCAPTCHA is not configured on the server",
            code: "RECAPTCHA_NOT_CONFIGURED",
          });
        }
        logger.error("[Reset password] reCAPTCHA verify error:", { message: err.message });
        return res.status(400).json({
          error: "reCAPTCHA verification could not be completed",
          code: "RECAPTCHA_ERROR",
        });
      }
    }

    try {
      // Hash the provided token to compare with stored hash
      const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

      // Find user by reset token (not restricted to admin only)
      const user = await User.findOne({
        where: { passwordResetToken: hashedToken },
      });

      if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      user.passwordHash = await hashPassword(password);
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save();

      // #859: a successful reset is the documented unlock path for a
      // locked-out legitimate user. Clear both the org-less and the
      // org-scoped throttle keys for this account -- both are keyed by
      // email since #892 dropped username as a login credential.
      clearThrottle(loginThrottleKey({ email: user.email }));
      if (user.organizationId) {
        clearThrottle(
          loginThrottleKey({
            organizationId: user.organizationId,
            email: user.email,
          })
        );
      }

      // Send password changed confirmation email (non-blocking)
      if (user.email && !user.isAnonymous) {
        const Organization = (await import("../models/Organization.js")).default;
        const org = await Organization.findOne({ where: { organizationId: user.organizationId } });

        sendPasswordChangedEmail(user.email, {
          userName: user.username,
          organizationId: user.organizationId,
          organization: org,
          adminEmail: null, // Could fetch admin email if needed
        }).catch((err) => {
          logger.error("Failed to send password changed email:", { message: err.message });
        });
      }

      // #490: revoke all existing sessions before issuing new ones so stolen
      // tokens cannot be used after a password reset.
      const { generateToken, createSession, revokeAllSessions, ACCESS_TOKEN_TTL_MS } =
        await import("../middleware/auth.js");

      await revokeAllSessions(user.id);

      const { token: authToken, jti: accessJti } = generateToken(user.id, user.organizationId);
      await createSession(accessJti, user.id, user.organizationId, "access", ACCESS_TOKEN_TTL_MS);
      await user.update({ lastActiveAt: new Date() });

      res.json({
        success: true,
        message: "Password has been successfully reset. You are now logged in.",
        token: authToken,
        user: {
          id: user.id,
          username: user.username,
          isAnonymous: user.isAnonymous,
          isAdmin: user.isAdmin,
          isSuperuser: user.isSuperuser,
          hasSeenSuperuserWalkthrough: user.hasSeenSuperuserWalkthrough,
          hasSeenAdminWalkthrough: user.hasSeenAdminWalkthrough,
          hasSeenUserWalkthrough: user.hasSeenUserWalkthrough,
          superuserWalkthroughStep: user.superuserWalkthroughStep ?? null,
          adminWalkthroughStep: user.adminWalkthroughStep ?? null,
          userWalkthroughStep: user.userWalkthroughStep ?? null,
          organizationId: user.organizationId,
        },
      });
    } catch (error) {
      logger.error("Password reset error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);
// === Phase 5 follow-up (#892 PR4): magic-link guest access =================
// POST /api/auth/magic-link  Body: { email }
//
// Replaces the removed anonymous-account mode with the REAL-ROWS shape
// (Rodney's decision, 2026-08-19): redeeming the link ensures a real User
// row + a demo-corp membership, consistent with the demo-signup / lead-
// capture direction -- NOT the older ephemeral no-row session idea. That
// ephemeral idea already exists as a separate, unrelated feature
// (POST /billing/demo-access, a 2h JWT with no DB row) and is untouched by
// this change.
//
// Anti-enumeration: mirrors requestPasswordResetHandler's posture exactly
// -- ALWAYS the same 200 body whether or not a User row exists for the
// email and whether or not the downstream send succeeds. Unlike password
// reset, this route never needs to branch on "does a User exist": a magic
// link works identically for a brand-new guest and an existing account, so
// there is nothing to hide behind a conditional send.
const magicLinkGenericResponse = {
  success: true,
  message: "If that address can receive mail, a sign-in link is on its way.",
};

router.post(
  "/magic-link",
  auditLogger({ action: "auth.magic-link.request", resourceType: "auth", requireAuth: false }),
  [
    // Same required-email pattern as /login (trim sanitiser, then
    // notEmpty + isEmail; NOT validationRules.email's .normalizeEmail(),
    // which is more aggressive than the registration/lookup storage
    // normalisation and would make later exact-match lookups miss).
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Must be a valid email address"),
    handleValidationErrors,
  ],
  async (req, res) => {
    const logger = createLogger(req);
    const { email, recaptchaToken } = req.body;

    // Issue #559 posture, mirrored from requestPasswordResetHandler: verify
    // reCAPTCHA when the frontend attaches a token, but a failure still
    // returns the generic response so it cannot be used to distinguish
    // "captcha failed" from "account exists / not exists".
    if (recaptchaToken) {
      try {
        const result = await verifyRecaptcha(recaptchaToken, req.ip);
        if (!result.success) {
          return res.json(magicLinkGenericResponse);
        }
      } catch (err) {
        if (err.statusCode === 503) {
          return res.status(503).json({
            error: "reCAPTCHA is not configured on the server",
            code: "RECAPTCHA_NOT_CONFIGURED",
          });
        }
        logger.error("[Magic link] reCAPTCHA verify error:", { message: err.message });
        return res.json(magicLinkGenericResponse);
      }
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Purpose-bound, pinned-algorithm JWT -- the same family as the
      // org-pick token (/org-switch/token, /select-org) below. A JWT alone
      // is not single-use, so `jti` is also recorded in MagicLinkTokens and
      // consumed atomically on redeem (see /magic-link/redeem). No User row
      // is required to exist yet: it is created on redeem if missing, which
      // is why this cannot reuse the reset-password token pattern of
      // storing the token directly on the Users row.
      const jti = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 min

      await MagicLinkToken.create({ jti, email: normalizedEmail, expiresAt });

      const token = jwt.sign(
        { email: normalizedEmail, purpose: "magic-link" },
        process.env.JWT_SECRET,
        { expiresIn: "15m", algorithm: "HS256", jwtid: jti }
      );

      try {
        await sendMagicLinkEmail(normalizedEmail, token);
      } catch (mailError) {
        // Swallow so the response shape cannot be used to enumerate
        // deliverability or account state. The token is saved; a retry
        // request mints a fresh one.
        logger.error("Magic link email send failed:", mailError);
      }

      return res.json(magicLinkGenericResponse);
    } catch (error) {
      logger.error("Magic link request error:", error);
      return res.status(500).json({ error: "Failed to process magic link request" });
    }
  }
);

// POST /api/auth/magic-link/redeem  Body: { token }
//
// Deliberate deviation from the issue's `GET /auth/magic-link?token=`
// sketch: email clients and security scanners prefetch GET links, which
// would silently burn the single-use token before a human ever clicks it.
// Instead the emailed link lands on a frontend page
// (`/auth/magic-link?token=...`) that shows a single "Continue as guest"
// action, and the actual consumption is this POST, fired only on that
// explicit click. A scanner prefetching the GET page is harmless; only a
// real click reaches this endpoint.
router.post(
  "/magic-link/redeem",
  auditLogger({ action: "auth.magic-link.redeem", resourceType: "auth", requireAuth: false }),
  [body("token").notEmpty().withMessage("Token is required"), handleValidationErrors],
  async (req, res) => {
    const logger = createLogger(req);
    const { token } = req.body;

    let payload;
    try {
      // Pinned algorithm: never let `alg: none` or an attacker-chosen
      // algorithm through.
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
      return res.status(400).json({ error: "Invalid or expired link" });
    }

    // Purpose check: a reset-password token is not even a JWT (it fails
    // jwt.verify above), but an org-pick token IS a same-secret HS256 JWT
    // and must not redeem here, exactly as /select-org checks
    // `payload.step === "org-pick"` to reject a magic-link token there.
    if (payload.purpose !== "magic-link" || !payload.email || !payload.jti) {
      return res.status(400).json({ error: "Invalid or expired link" });
    }

    try {
      // Atomic single-use consumption: the WHERE clause only matches a row
      // that has not been consumed yet, so a concurrent second redeem of
      // the same token affects zero rows instead of racing a
      // find-then-update (an improvement on reset-password's own
      // find-then-save, which is not race-free under concurrent requests).
      const [affected] = await MagicLinkToken.update(
        { consumedAt: new Date() },
        { where: { jti: payload.jti, consumedAt: null } }
      );
      if (affected === 0) {
        return res.status(400).json({ error: "Invalid or expired link" });
      }

      const normalizedEmail = payload.email;
      const demoOrgId = process.env.DEMO_ORG_ID || "demo-corp";

      // Resolve the demo-corp tenant_id, mirroring /demo-signup exactly.
      const tenants = await platformSequelize.query(
        "SELECT id FROM tenants WHERE org_id = :organizationId",
        {
          replacements: { organizationId: demoOrgId },
          type: QueryTypes.SELECT,
        }
      );
      if (tenants.length === 0) {
        logger.error("[MagicLink] demo-corp tenant not configured", { demoOrgId });
        return res.status(500).json({ error: "Demo organisation not available." });
      }
      const tenant_id = tenants[0].id;

      const models = await import("../models/index.js");
      const { findUniqueUsername } = await import("./oauth.js");

      const { user, isNewUser, membership } = await models.sequelize.transaction(async (t) => {
        await models.sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
          replacements: { tid: tenant_id },
          transaction: t,
        });

        // "If a row exists, use it unchanged": organizationId is immutable
        // after creation (User.js beforeUpdate hook) so an existing user
        // from another org keeps their own org here -- only the
        // membership + session below are demo-corp-scoped.
        let user = await User.findOne({ where: { email: normalizedEmail }, transaction: t });
        let isNewUser = false;

        if (!user) {
          const username = await findUniqueUsername(null, normalizedEmail);
          user = await User.create(
            {
              username,
              passwordHash: null,
              email: normalizedEmail,
              isAnonymous: false,
              isApproved: true,
              organizationId: demoOrgId,
              tenant_id,
              signupSource: "magic-link",
              lastActiveAt: new Date(),
            },
            { transaction: t }
          );
          isNewUser = true;
        }

        // A guest link never grants privileges, but it must not misreport
        // them either: an existing demo-corp member (e.g. a fixture admin)
        // keeps their real membership flags, and the response below has to
        // reflect that row, not hardcoded plain-member values.
        let membership = await UserOrganizationMembership.findOne({
          where: { userId: user.id, organizationId: demoOrgId },
          transaction: t,
        });
        if (!membership) {
          membership = await UserOrganizationMembership.create(
            {
              userId: user.id,
              organizationId: demoOrgId,
              isAdmin: false,
              isApproved: true,
              isSuperuser: false,
            },
            { transaction: t }
          );
        }

        return { user, isNewUser, membership };
      });

      const { generateToken, createSession, ACCESS_TOKEN_TTL_MS } =
        await import("../middleware/auth.js");

      const { token: authToken, jti: accessJti } = generateToken(user.id, demoOrgId);
      await createSession(accessJti, user.id, demoOrgId, "access", ACCESS_TOKEN_TTL_MS);
      await user.update({ lastActiveAt: new Date() });

      logger.info("[MagicLink] redeemed", { userId: user.id, isNewUser });

      // Same response shape as /login so the frontend can reuse handling.
      return res.json({
        token: authToken,
        user: {
          id: user.id,
          username: user.username,
          isAnonymous: false,
          isAdmin: membership.isAdmin,
          isSuperuser: membership.isSuperuser,
          isPlatformOwner: !!(
            process.env.PLATFORM_OWNER_ID && user.id === process.env.PLATFORM_OWNER_ID
          ),
          hasSeenSuperuserWalkthrough: user.hasSeenSuperuserWalkthrough,
          hasSeenAdminWalkthrough: user.hasSeenAdminWalkthrough,
          hasSeenUserWalkthrough: user.hasSeenUserWalkthrough,
          superuserWalkthroughStep: user.superuserWalkthroughStep ?? null,
          adminWalkthroughStep: user.adminWalkthroughStep ?? null,
          userWalkthroughStep: user.userWalkthroughStep ?? null,
          isApproved: membership.isApproved,
          organizationId: demoOrgId,
        },
      });
    } catch (err) {
      logger.error("[MagicLink] redeem failed", { message: err.message });
      return res
        .status(500)
        .json(formatServerError(err, "Magic link redeem failed", "[MagicLink]"));
    }
  }
);

// Phase 5 (#892): provider discovery for the unified login UX.
//
// POST /api/auth/discover-providers  Body: { email }
//   -> { providers: string[], orgId: string | null }
//
// `providers` is the subset of [google, github, microsoft, azure-ad]
// that is enabled AND configured across every approved org the email
// belongs to. `orgId` is populated only when the email resolves to a
// single org AND that org has at least one configured provider; the
// multi-org case returns no orgId so the downstream pickToken flow
// disambiguates.
//
// Enumeration-safe: unknown email, password-only user, no approved
// memberships, and known-email-with-no-configured-providers ALL return
// the same `{ providers: [], orgId: null }` shape so the endpoint
// cannot be used to enumerate accounts. Rate limit (rateLimiters.auth,
// 20 req / 15 min per IP) is wired in index.js alongside the other
// /api/auth/* mounts.
router.post(
  "/discover-providers",
  auditLogger({
    action: "auth.discover-providers",
    resourceType: "auth",
    requireAuth: false,
  }),
  [
    // Inline validator chain, NOT validationRules.email. The shared rule
    // applies validator.js normalizeEmail (which strips gmail dots / plus
    // tags) so the lookup would miss the registration-stored form. Mirror
    // the /login email validator (auth.js ~700): .trim() sanitiser only,
    // then notEmpty + isEmail; the handler does the trim+lowercase that
    // matches registration storage.
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Must be a valid email address"),
    handleValidationErrors,
  ],
  async (req, res) => {
    const logger = createLogger(req);
    const emptyResponse = { providers: [], orgId: null };
    const rawEmail = req.body?.email;
    if (typeof rawEmail !== "string" || rawEmail.trim() === "") {
      return res.json(emptyResponse);
    }
    // Mirror auth.js org-less login normalisation EXACTLY: trim+lower,
    // NOT validator.js normalizeEmail (which is more aggressive and
    // would miss exact-match lookups). validationRules.email already
    // applied normalizeEmail, but we re-normalise from req.body so the
    // lookup key matches the storage form used at registration.
    const normalizedEmail = rawEmail.trim().toLowerCase();

    try {
      // findAll (not findOne) so the legacy split-identity case is
      // still covered: pre-#858 a single email could exist across
      // multiple User rows. We union providers across all matching
      // rows' memberships rather than failing closed - this endpoint
      // is read-only and never issues a session, so a split identity
      // is a non-event here.
      const users = await User.findAll({ where: { email: normalizedEmail } });
      if (users.length === 0) {
        return res.json(emptyResponse);
      }

      const userIds = users.map((u) => u.id);
      const memberships = await UserOrganizationMembership.findAll({
        where: { userId: userIds, isApproved: true },
        attributes: ["organizationId"],
      });
      if (memberships.length === 0) {
        return res.json(emptyResponse);
      }

      const orgIds = [...new Set(memberships.map((m) => m.organizationId))];
      const orgs = await Organization.findAll({
        where: { organizationId: orgIds },
      });

      const providersSet = new Set();
      for (const org of orgs) {
        for (const p of getActiveProvidersForOrg(org)) {
          providersSet.add(p);
        }
      }
      const providers = OAUTH_PROVIDERS.filter((p) => providersSet.has(p));
      const orgId = orgIds.length === 1 && providers.length > 0 ? orgIds[0] : null;

      return res.json({ providers, orgId });
    } catch (err) {
      logger.error("[discover-providers] lookup failed", { message: err.message });
      return res
        .status(500)
        .json(formatServerError(err, "Provider discovery failed", "[discover-providers]"));
    }
  }
);

// Register
router.post(
  "/register",
  auditLogger({ action: "auth.register", resourceType: "auth", requireAuth: false }),
  [
    // #892: email is the sole credential on BOTH the org-scoped and
    // org-less paths -- there is no more anonymous (email-optional)
    // registration. Mirrors the /login and /demo-signup email validator
    // exactly (trim sanitiser, then notEmpty + isEmail; NOT
    // validationRules.email's .normalizeEmail(), for the same reason
    // documented on /login: the handler's own trim+lowercase must match
    // the storage form).
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Must be a valid email address"),
    // Optional display name, used only to seed the auto-generated
    // username (findUniqueUsername below). Username itself is no longer
    // user input -- validationRules.username is gone.
    body("fullName")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 255 })
      .withMessage("Full name must be at most 255 characters"),
    validationRules.password,
    handleValidationErrors,
  ],
  async (req, res) => {
    const logger = createLogger(req);
    const { password, email, fullName, recaptchaToken, referralCode } = req.body;
    // Phase 5 (5d, #869): organizationId is reassignable so the org-less
    // self-serve branch below can default it to the shared self-serve org.
    let { organizationId } = req.body;
    // Captured BEFORE the reassignment: true iff the request arrived with
    // no org (bare/main-domain self-serve signup). A self-serve signup must
    // never inherit an org's auto-superuser grant regardless of that org's
    // oauthAutoSuperuser flag (the shared self-serve org, e.g. demo-corp,
    // is a public sandbox; self-serve users are plain members). #869
    // follow-up: org-less self-serve != OAuth auto-provisioning.
    const orgLessSelfServe = !organizationId;

    // Onboarding plan: soft consultant referral attribution. Stored as-is at
    // signup (never validated, never blocks registration); reconciled to a
    // commission only if the user later converts to a paid org.
    const trimmedReferral =
      typeof referralCode === "string" && referralCode.trim()
        ? referralCode.trim().slice(0, 64)
        : null;

    logger.info("[Registration] Request received:", {
      email: email ? `${email.substring(0, 3)}***` : "none",
      organizationId: organizationId || "NOT PROVIDED",
    });

    // Issue #476 (register-only scope). Historically the frontend attached
    // recaptchaToken only for anonymous (email-optional) registrations;
    // #892 removes that branch entirely, so RegisterForm no longer
    // generates a token here at all. Left wired for the per-tenant
    // captcha behaviour on normal (org-scoped) registrations, which was
    // and remains unaffected by that removal: if a token IS attached, it
    // MUST verify; otherwise the server has no way to distinguish a
    // legitimate frontend call (where the per-tenant useCaptcha flag says
    // "off") from a direct curl. No token = pass-through, preserving
    // existing per-tenant captchaEnabled behaviour. Login and
    // password-reset verification is tracked as a follow-up.
    if (recaptchaToken) {
      try {
        const result = await verifyRecaptcha(recaptchaToken, req.ip);
        if (!result.success) {
          return res.status(400).json({
            error: "reCAPTCHA verification failed",
            code: "RECAPTCHA_FAILED",
          });
        }
      } catch (err) {
        if (err.statusCode === 503) {
          return res.status(503).json({
            error: "reCAPTCHA is not configured on the server",
            code: "RECAPTCHA_NOT_CONFIGURED",
          });
        }
        logger.error("[Registration] reCAPTCHA verify error:", { message: err.message });
        return res.status(400).json({
          error: "reCAPTCHA verification could not be completed",
          code: "RECAPTCHA_ERROR",
        });
      }
    }

    try {
      // #892: username is no longer user input (auto-generated below), so
      // there is no username-uniqueness check to run here; the DB UNIQUE
      // constraint on username is the backstop for the rare
      // findUniqueUsername collision race.

      // Email is validated as required above, so this check is now
      // unconditional.
      const normalizedEmail = email.trim().toLowerCase();
      const existingEmail = await User.findOne({
        where: { email: normalizedEmail },
      });
      if (existingEmail) {
        return res.status(409).json({ error: "Email already in use" });
      }

      const hash = await hashPassword(password);

      // === Phase 5 (5d, #869): org-optional self-serve registration =====
      // No organizationId (bare/main domain self-serve signup, the 5b
      // routing change) => default to the shared self-serve org. RLS is
      // not a factor here: /api/auth/register skips resolveTenant
      // (index.js:378), so this runs as the privileged role (BYPASSRLS in
      // prod, OPERATIONAL_GOTCHAS #6), exactly like the 5a org-less
      // /auth/login branch. The email-uniqueness check above
      // (User.findOne by email, no tenant scope) is therefore a
      // CROSS-TENANT global guard: it is the forward global-email guard
      // the Phase 5 5-pre caveat requires to keep the single-identity
      // invariant. An org-less signup whose email already exists in ANY
      // tenant gets the identical 409 "Email already in use" above (no
      // new enumeration oracle). Email is mandatory on this path: the
      // Phase 5 identity is email-keyed and a NULL-email account cannot
      // use main-domain credentials login by design
      // (AUTH_ONBOARDING_PLAN, Correction Design point 4). #892 finishes
      // the job: the validator chain above now enforces email
      // unconditionally on BOTH paths, so this branch no longer needs its
      // own "Email is required" 400 -- a request without email is already
      // rejected before reaching here. The org-scoped path (organizationId
      // present, e.g. subdomain/invite) is unchanged.
      if (!organizationId) {
        organizationId = process.env.SELF_SERVE_ORG_ID || process.env.DEMO_ORG_ID || "demo-corp";
        logger.info("[Registration] Org-less self-serve: defaulting org", {
          organizationId,
        });
      }
      // === end org-less branch; org-scoped path unchanged below =========

      logger.info("[Registration] Creating user with organizationId:", {
        organizationId: organizationId || "NULL",
      });

      // Query platform database to get tenant_id for the organizationId
      let tenant_id = null;
      if (organizationId) {
        try {
          const tenants = await platformSequelize.query(
            "SELECT id FROM tenants WHERE org_id = :organizationId",
            {
              replacements: { organizationId },
              type: QueryTypes.SELECT,
            }
          );

          if (tenants.length > 0) {
            tenant_id = tenants[0].id;
            logger.info("[Registration] Found tenant_id:", { tenant_id, organizationId });
          } else {
            logger.info("[Registration] No tenant found for organizationId:", { organizationId });
            return res.status(400).json({
              error: "Invalid organization ID. Please check your registration link.",
            });
          }
        } catch (dbError) {
          logger.error("[Registration] Error querying tenant:", dbError);
          return res.status(500).json({
            error: "Failed to validate organization. Please try again.",
          });
        }
      } else {
        // Unreachable post-5d (#869): the org-less branch above always
        // resolves organizationId to the self-serve org, and the
        // org-scoped path supplies it. Defensive invariant guard only.
        logger.error("[Registration] Invariant: organizationId unresolved");
        return res.status(400).json({
          error: "Organization ID is required for registration.",
        });
      }

      // #892: username is no longer user input. Auto-generate a display
      // name from fullName/email before the transaction, exactly like
      // /demo-signup (auth.js ~786) -- same shared OAuth helper, same
      // username-collision retry policy. findUniqueUsername tolerates an
      // absent fullName (falls back to the email local part).
      const { findUniqueUsername } = await import("./oauth.js");
      const username = await findUniqueUsername(fullName, normalizedEmail);

      // Check if self-registration is allowed for this organization.
      // SET LOCAL is scoped to the current transaction, so wrap the tenant
      // context setup and every follow-up RLS-sensitive query in one
      // sequelize.transaction(...) block. Issue #562.
      const Organization = (await import("../models/Organization.js")).default;
      const { sequelize } = await import("../models/index.js");

      const txResult = await sequelize.transaction(async (t) => {
        await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
          replacements: { tid: tenant_id },
          transaction: t,
        });

        const org = await Organization.findOne({
          where: { organizationId },
          transaction: t,
        });

        if (!org) return null;

        const requiresApproval = !org.allowSelfRegistration;

        // org.oauthAutoSuperuser auto-grants superuser on the org-scoped
        // (subdomain/invite) path - unchanged. But an org-less self-serve
        // signup must NEVER inherit it: the shared self-serve org is a
        // public sandbox, so a random public signup would otherwise become
        // a superuser of it. Org-less self-serve users are plain members
        // (#869 follow-up; org-scoped path byte-for-byte unchanged).
        const autoSuperuser = !requiresApproval && !!org.oauthAutoSuperuser && !orgLessSelfServe;

        const user = await User.create(
          {
            username,
            passwordHash: hash,
            email: normalizedEmail,
            // #892: email is required by the validator chain above, so a
            // created account always has one -- never anonymous.
            isAnonymous: false,
            isApproved: !requiresApproval,
            organizationId: organizationId || null,
            tenant_id: tenant_id,
            // #892 follow-up: tag the source for lead-outreach segmentation.
            // Org-less self-serve lands in the shared self-serve org (today
            // demo-corp); org-scoped means an admin-invited user arrived on
            // an org subdomain register URL.
            signupSource: orgLessSelfServe ? "demo-signup" : "invite",
            ...(autoSuperuser && { isSuperuser: true }),
            ...(trimmedReferral && {
              referredByConsultantCode: trimmedReferral,
              referralCapturedAt: new Date(),
            }),
          },
          { transaction: t }
        );

        await UserOrganizationMembership.create(
          {
            userId: user.id,
            organizationId: organizationId,
            isAdmin: false,
            isApproved: !requiresApproval,
            isSuperuser: autoSuperuser,
          },
          { transaction: t }
        );

        let admins = [];
        if (requiresApproval && user.email) {
          admins = await User.findAll({
            where: {
              organizationId: user.organizationId,
              isAdmin: true,
            },
            attributes: ["email", "username"],
            transaction: t,
          });
        }

        return { org, user, requiresApproval, admins };
      });

      if (!txResult) {
        return res.status(400).json({ error: "Organization not found." });
      }

      const { org, user, requiresApproval, admins } = txResult;

      const demoOrgId = process.env.DEMO_ORG_ID || "demo-corp";
      if (organizationId === demoOrgId) {
        notifyEvent(
          `Demo lead: ${user.username}`,
          `${user.email || "(no email)"}\nOrg: ${organizationId}${requiresApproval ? "\nNeeds approval" : ""}`
        ).catch(() => {});
      }

      if (requiresApproval) {
        logger.info("[Registration] Self-registration disabled - user will require approval");
      }

      logger.info("[Registration] User created:", {
        id: user.id,
        username: user.username,
        isApproved: user.isApproved,
        organizationId: user.organizationId || "NO ORG ID SAVED!",
      });

      // If user requires approval, notify admins and return pending status.
      // `admins` was fetched inside the tenant transaction above (#562).
      if (requiresApproval) {
        if (user.email) {
          for (const admin of admins) {
            if (admin.email) {
              sendAdminUserPendingApprovalEmail(admin.email, {
                adminName: admin.username,
                newUserName: user.username,
                newUserEmail: user.email,
                organizationId: user.organizationId,
                organization: org,
              }).catch((err) => {
                logger.error(`Failed to send admin notification to ${admin.email}:`, {
                  message: err.message,
                });
              });
            }
          }
        }

        return res.status(202).json({
          success: true,
          pending: true,
          message:
            "Registration successful! Your account is pending approval by an administrator. You will receive an email when your account is approved.",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            isApproved: false,
          },
        });
      }

      // Send welcome email for immediately approved users (non-blocking)
      if (user.email) {
        sendWelcomeEmail(user.email, {
          userName: user.username,
          organizationId: user.organizationId,
          organization: org,
          adminEmail: null,
        }).catch((err) => {
          logger.error("Failed to send welcome email:", { message: err.message });
        });
      }

      const { generateToken, createSession, ACCESS_TOKEN_TTL_MS } =
        await import("../middleware/auth.js");

      const { token, jti: accessJti } = generateToken(user.id, user.organizationId);
      await createSession(accessJti, user.id, user.organizationId, "access", ACCESS_TOKEN_TTL_MS);
      await user.update({ lastActiveAt: new Date() });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          isAnonymous: user.isAnonymous,
          isAdmin: user.isAdmin,
          isSuperuser: user.isSuperuser,
          isPlatformOwner: !!(
            process.env.PLATFORM_OWNER_ID && user.id === process.env.PLATFORM_OWNER_ID
          ),
          hasSeenSuperuserWalkthrough: user.hasSeenSuperuserWalkthrough,
          hasSeenAdminWalkthrough: user.hasSeenAdminWalkthrough,
          hasSeenUserWalkthrough: user.hasSeenUserWalkthrough,
          superuserWalkthroughStep: user.superuserWalkthroughStep ?? null,
          adminWalkthroughStep: user.adminWalkthroughStep ?? null,
          userWalkthroughStep: user.userWalkthroughStep ?? null,
          isApproved: user.isApproved,
          organizationId: user.organizationId,
        },
      });
    } catch (err) {
      res
        .status(500)
        .json(formatServerError(err, "Registration failed", "[Registration] Error creating user:"));
    }
  }
);

// === Phase 5 follow-up (#892, PR3): dedicated demo-corp signup ===========
// POST /api/auth/demo-signup
//
// Lead-capture entry point. A prospect supplies email + fullName +
// companyName + password (and reCAPTCHA), gets a real User row in the
// demo-corp tenant, and lands in demo-corp with a real session.
//
// Differs from /register on three counts:
//   - Captures companyName (the prospect's own company, separate from the
//     demo-corp tenant Organization).
//   - Hardcoded to demo-corp; the SELF_SERVE_ORG_ID fallback is not used.
//   - Username is auto-generated from fullName+email via the shared OAuth
//     findUniqueUsername helper. The user never types or sees a username
//     (Phase 5 identity model is email-keyed).
//
// The existing shared dcuser/dcadmin/dcsuper credentials remain as internal
// test fixtures and are no longer exposed on the public site; this route
// is the public-facing replacement.
router.post(
  "/demo-signup",
  auditLogger({ action: "auth.demo-signup", resourceType: "auth", requireAuth: false }),
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Must be a valid email address"),
    body("fullName")
      .trim()
      .notEmpty()
      .withMessage("Full name is required")
      .isLength({ min: 1, max: 255 }),
    body("companyName")
      .trim()
      .notEmpty()
      .withMessage("Company name is required")
      .isLength({ min: 1, max: 255 }),
    body("password")
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    handleValidationErrors,
  ],
  async (req, res) => {
    const logger = createLogger(req);
    const { email, fullName, companyName, password, recaptchaToken } = req.body;

    // reCAPTCHA verify when token attached. Posture matches /register:
    // optional in dev, the public form always sends one in prod.
    if (recaptchaToken) {
      try {
        const result = await verifyRecaptcha(recaptchaToken, req.ip);
        if (!result.success) {
          return res
            .status(400)
            .json({ error: "reCAPTCHA verification failed", code: "RECAPTCHA_FAILED" });
        }
      } catch (err) {
        if (err.statusCode === 503) {
          return res.status(503).json({
            error: "reCAPTCHA is not configured on the server",
            code: "RECAPTCHA_NOT_CONFIGURED",
          });
        }
        logger.error("[DemoSignup] reCAPTCHA verify error", { message: err.message });
        return res.status(400).json({
          error: "reCAPTCHA verification could not be completed",
          code: "RECAPTCHA_ERROR",
        });
      }
    }

    const normalizedEmail = email.trim().toLowerCase();
    const demoOrgId = process.env.DEMO_ORG_ID || "demo-corp";

    try {
      // Cross-tenant email uniqueness guard. Same posture as /register
      // org-less self-serve: this route skips resolveTenant so the lookup
      // runs as the privileged role and is the forward global-email guard
      // required by the Phase 5 single-identity invariant.
      const existing = await User.findOne({ where: { email: normalizedEmail } });
      if (existing) {
        return res.status(409).json({ error: "Email already in use" });
      }

      // Auto-generate username from fullName/email so the user never needs
      // to type one. Reuses the OAuth callback helper to keep the
      // username-collision retry policy consistent.
      const { findUniqueUsername } = await import("./oauth.js");
      const username = await findUniqueUsername(fullName, normalizedEmail);

      // Resolve the demo-corp tenant_id via the platform DB.
      const tenants = await platformSequelize.query(
        "SELECT id FROM tenants WHERE org_id = :organizationId",
        {
          replacements: { organizationId: demoOrgId },
          type: QueryTypes.SELECT,
        }
      );
      if (tenants.length === 0) {
        logger.error("[DemoSignup] demo-corp tenant not configured", { demoOrgId });
        return res.status(500).json({ error: "Demo organisation not available." });
      }
      const tenant_id = tenants[0].id;

      const passwordHash = await hashPassword(password);
      const models = await import("../models/index.js");

      const { user, organization } = await models.sequelize.transaction(async (t) => {
        await models.sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
          replacements: { tid: tenant_id },
          transaction: t,
        });

        const organization = await Organization.findOne({
          where: { organizationId: demoOrgId },
          transaction: t,
        });
        if (!organization) {
          throw new Error("Demo organisation not configured.");
        }

        const user = await User.create(
          {
            username,
            passwordHash,
            email: normalizedEmail,
            organizationId: demoOrgId,
            tenant_id,
            isAnonymous: false,
            isApproved: true,
            signupSource: "demo-signup",
            companyName: companyName.trim(),
            lastActiveAt: new Date(),
          },
          { transaction: t }
        );

        await UserOrganizationMembership.create(
          {
            userId: user.id,
            organizationId: demoOrgId,
            isAdmin: false,
            isApproved: true,
            isSuperuser: false,
          },
          { transaction: t }
        );

        return { user, organization };
      });

      // Lead notification (same channel as the existing demo-corp /register
      // notifyEvent so leads land in one place).
      notifyEvent(
        `Demo signup: ${user.username}`,
        `${user.email}\nName: ${fullName}\nCompany: ${companyName}\nOrg: ${demoOrgId}`
      ).catch(() => {});

      // Welcome email non-blocking.
      sendWelcomeEmail(user.email, {
        userName: fullName,
        organizationId: demoOrgId,
        organization,
        adminEmail: null,
      }).catch((err) => {
        logger.error("[DemoSignup] Failed to send welcome email", { message: err.message });
      });

      const { generateToken, createSession, ACCESS_TOKEN_TTL_MS } =
        await import("../middleware/auth.js");

      const { token, jti: accessJti } = generateToken(user.id, demoOrgId);
      await createSession(accessJti, user.id, demoOrgId, "access", ACCESS_TOKEN_TTL_MS);

      logger.info("[DemoSignup] success", { userId: user.id });

      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          isAnonymous: false,
          isAdmin: false,
          isSuperuser: false,
          isPlatformOwner: false,
          hasSeenSuperuserWalkthrough: false,
          hasSeenAdminWalkthrough: false,
          hasSeenUserWalkthrough: false,
          superuserWalkthroughStep: null,
          adminWalkthroughStep: null,
          userWalkthroughStep: null,
          isApproved: true,
          organizationId: demoOrgId,
        },
      });
    } catch (err) {
      logger.error("[DemoSignup] failed", { message: err.message });
      return res.status(500).json(formatServerError(err, "Demo signup failed", "[DemoSignup]"));
    }
  }
);

// Login
router.post(
  "/login",
  auditLogger({ action: "auth.login", resourceType: "auth", requireAuth: false }),
  [
    // Phase 5 (5a, #858) made /auth/login org-optional; #892 finishes the
    // job by dropping username as a credential entirely. Email is now the
    // sole credential on BOTH paths (org-less and org-scoped) -- there is
    // no more `.if(!organizationId)` branch on this validator. Username
    // remains only as a display name on the User row, never checked here.
    // Email is intentionally NOT run through .normalizeEmail() here:
    // validator.js normalisation is more aggressive than the registration
    // storage normalisation (email.trim().toLowerCase(), auth.js:295), so
    // normalising in the validator would make the lookup miss. The handler
    // applies the exact registration normalisation instead.
    body("email")
      // .trim() is a sanitiser (runs before the validators below): a
      // trailing space pasted with an email should not be a hard 400.
      // Case is normalised in the handler to match registration storage.
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Must be a valid email address"),
    // #980: when organizationId is present it must be a string BEFORE it
    // reaches getTenantId or the membership where-clause -- parity with the
    // handler's own typeof guard on the email. Absent organizationId is the
    // org-less branch and stays untouched. Deliberately only a type guard,
    // not a format check: an unknown-but-string org id must keep resolving
    // to the same 401 as today, not gain a distinguishable 400.
    body("organizationId").optional().isString().withMessage("organizationId must be a string"),
    body("password").notEmpty().withMessage("Password is required"),
    handleValidationErrors,
  ],
  async (req, res) => {
    const logger = createLogger(req);
    const { password, organizationId, recaptchaToken } = req.body;
    logger.info(`[Login] Attempt - organizationId: ${organizationId}`);

    // Issue #559: verify reCAPTCHA when the frontend attaches a token. On
    // failure, return 401 Invalid credentials so a bot cannot distinguish a
    // failed captcha from a bad password (oracle-safe). Missing server-side
    // secret returns 503 to surface the misconfiguration.
    if (recaptchaToken) {
      try {
        const result = await verifyRecaptcha(recaptchaToken, req.ip);
        if (!result.success) {
          return res.status(401).json({ error: "Invalid credentials" });
        }
      } catch (err) {
        if (err.statusCode === 503) {
          return res.status(503).json({
            error: "reCAPTCHA is not configured on the server",
            code: "RECAPTCHA_NOT_CONFIGURED",
          });
        }
        logger.error("[Login] reCAPTCHA verify error:", { message: err.message });
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }

    try {
      // === Phase 5 (#859): per-credential login lockout =================
      // Keyed off the submitted credential -- email on both the org-less
      // and org-scoped paths (#892 dropped username as a credential),
      // counted regardless of whether the account exists so lock
      // behaviour cannot enumerate accounts. Placed AFTER the reCAPTCHA
      // block so bot/captcha 401s do not count toward an account lock. A
      // locked key short-circuits with the IDENTICAL 401 + a full dummy
      // verify (timing parity), so a locked state is indistinguishable
      // from ordinary invalid credentials. The res.on("finish") hook
      // records a failure on any 401 and clears the throttle on a 200,
      // without sprinkling calls across the ~8 return points (401 =
      // credential failure on this route; 403 is authorisation, 400 is
      // validation, neither should lock).
      const throttleKey = loginThrottleKey({
        organizationId,
        email: req.body.email,
      });
      if (throttleKey) {
        res.on("finish", () => {
          if (res.statusCode === 401) registerFailure(throttleKey);
          else if (res.statusCode === 200) clearThrottle(throttleKey);
        });
        if (await isLocked(throttleKey)) {
          await verifyDummy(password);
          logger.info("[Login] Attempt against a locked credential key");
          return res.status(401).json({ error: "Invalid credentials" });
        }
      }

      // === Phase 5 (5a, #858): org-optional login =======================
      // No organizationId => authenticate by email against the single
      // canonical User row, then hand off to the existing picker
      // machinery. RLS is not a factor here: /api/auth/login skips
      // resolveTenant (index.js), so wrapTenantTransaction no-ops and the
      // connection runs as the privileged role (BYPASSRLS in prod,
      // OPERATIONAL_GOTCHAS #6). A cross-tenant User lookup therefore
      // needs no tenant context; tenant isolation is enforced by the
      // membership check, exactly as on the org-scoped path. No
      // user/email enumeration: unknown-email, wrong-password,
      // split-identity and no-approved-membership all return an identical
      // 401 with a full dummy verify for timing parity.
      if (!organizationId) {
        const rawEmail = req.body.email;
        // Mirror the registration storage normalisation EXACTLY
        // (auth.js:295 normalizedEmail = email.trim().toLowerCase()).
        // Do NOT use validator.js normalizeEmail: it is more aggressive
        // and would make the exact-match lookup miss.
        const normalizedEmail = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

        // Validation guarantees a non-empty valid email on this path;
        // this is defence in depth. NULL-email (anonymous / OAuth-only)
        // users are unreachable here by construction.
        const candidates = normalizedEmail
          ? await User.findAll({ where: { email: normalizedEmail } })
          : [];

        if (candidates.length === 0) {
          await verifyDummy(password);
          logger.info("[Login] Org-less: no user for email");
          return res.status(401).json({ error: "Invalid credentials" });
        }

        if (candidates.length > 1) {
          // Split identity: the per-tenant-unique email index permits the
          // same email as separate User rows across >1 org with
          // independent password hashes. The identity model says this
          // must not exist (5-pre confirmed zero in prod). Fail closed,
          // never silently pick one, and alert so the legacy data can be
          // deduped.
          await verifyDummy(password);
          logger.error("[Login] Org-less SPLIT IDENTITY fail-safe: >1 User row", {
            emailRowCount: candidates.length,
          });
          notifyError(
            "BR360 split-identity login blocked",
            `Org-less login for an email resolving to ${candidates.length} User rows was failed closed. Dedupe required to keep the Phase 5 single-identity invariant. See issue #858.`,
            { urgent: true }
          ).catch(() => {});
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = candidates[0];
        let valid;
        if (user.passwordHash) {
          valid = await verifyPassword(user.passwordHash, password);
          if (valid) await upgradeHashIfNeeded(user, password, logger);
        } else {
          // OAuth-only account that also carries an email: cannot
          // password-login. Equalise timing, then fail.
          await verifyDummy(password);
          valid = false;
        }
        if (!valid) {
          logger.info("[Login] Org-less: invalid password");
          return res.status(401).json({ error: "Invalid credentials" });
        }

        // Approved memberships drive the picker.
        // UserOrganizationMembership has no RLS policy and is read
        // cross-tenant here, exactly as the org-scoped path already does.
        const memberships = await UserOrganizationMembership.findAll({
          where: { userId: user.id, isApproved: true },
          attributes: ["organizationId", "isAdmin", "isSuperuser"],
        });

        if (memberships.length === 0) {
          // No approved org. Identical response to wrong-password (no
          // enumeration of approval state); the password verify already ran so the
          // timing profile matches.
          logger.info("[Login] Org-less: no approved membership", { userId: user.id });
          return res.status(401).json({ error: "Invalid credentials" });
        }

        if (memberships.length === 1) {
          // Single approved org: skip the picker, issue the org-scoped
          // session directly (same response shape as org-scoped login).
          const m = memberships[0];
          const { generateToken, createSession, ACCESS_TOKEN_TTL_MS } =
            await import("../middleware/auth.js");
          const { token, jti: accessJti } = generateToken(user.id, m.organizationId);
          await createSession(accessJti, user.id, m.organizationId, "access", ACCESS_TOKEN_TTL_MS);
          await user.update({ lastActiveAt: new Date() });
          logger.info("[Login] Org-less single-org success", {
            userId: user.id,
            organizationId: m.organizationId,
          });
          return res.json({
            token,
            user: {
              id: user.id,
              username: user.username,
              isAnonymous: user.isAnonymous,
              isAdmin: m.isAdmin,
              isSuperuser: m.isSuperuser,
              isPlatformOwner: !!(
                process.env.PLATFORM_OWNER_ID && user.id === process.env.PLATFORM_OWNER_ID
              ),
              hasSeenSuperuserWalkthrough: user.hasSeenSuperuserWalkthrough,
              hasSeenAdminWalkthrough: user.hasSeenAdminWalkthrough,
              hasSeenUserWalkthrough: user.hasSeenUserWalkthrough,
              superuserWalkthroughStep: user.superuserWalkthroughStep ?? null,
              adminWalkthroughStep: user.adminWalkthroughStep ?? null,
              userWalkthroughStep: user.userWalkthroughStep ?? null,
              organizationId: m.organizationId,
            },
          });
        }

        // Multi-org: mint the same short-lived pick token the org-switch
        // machinery uses and return the membership list inline. The user
        // has no session yet, so the protected GET /memberships is not
        // reachable; 5b's picker UI renders from this payload and
        // exchanges the pickToken via the existing public
        // POST /auth/select-org.
        const orgIds = memberships.map((mm) => mm.organizationId);
        const orgs = await Organization.findAll({
          where: { organizationId: orgIds },
          attributes: ["organizationId", "organizationName"],
        });
        const nameMap = Object.fromEntries(orgs.map((o) => [o.organizationId, o.organizationName]));
        const pickToken = jwt.sign({ id: user.id, step: "org-pick" }, process.env.JWT_SECRET, {
          expiresIn: "5m",
          algorithm: "HS256",
        });
        logger.info("[Login] Org-less multi-org: returning pickToken", {
          userId: user.id,
          orgCount: memberships.length,
        });
        return res.json({
          pickToken,
          multiOrg: true,
          primaryOrganizationId: user.primaryOrganizationId ?? null,
          memberships: memberships.map((mm) => ({
            organizationId: mm.organizationId,
            orgName: nameMap[mm.organizationId] || mm.organizationId,
            isAdmin: mm.isAdmin,
            isSuperuser: mm.isSuperuser,
          })),
        });
      }
      // === org-scoped branch (#892): email is now the credential ========
      // Mirrors the org-less branch immediately above: normalise the
      // same way as registration storage (email.trim().toLowerCase()),
      // look up by email instead of username inside the RLS transaction,
      // and equalise timing on every failure path (unknown email,
      // OAuth-only null password hash, wrong password) so none of them
      // is distinguishable from another. The per-tenant-unique email
      // index means this lookup returns at most one row. NULL-email
      // (anonymous) accounts are unreachable by this lookup by
      // construction, which is the intended "anonymous accounts
      // rejected" behaviour.
      const rawOrgEmail = req.body.email;
      const normalizedOrgEmail =
        typeof rawOrgEmail === "string" ? rawOrgEmail.trim().toLowerCase() : "";

      // Get tenant_id from platform database
      const { getTenantId } = await import("../middleware/tenantResolver.js");
      const tenant_id = await getTenantId(organizationId);

      if (!tenant_id) {
        logger.info(`[Login] No tenant found for organization: ${organizationId}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Set tenant context for RLS. SET LOCAL is scoped to the current
      // transaction, so wrap it and the follow-up User.findOne in a
      // sequelize.transaction(...) so the setting actually persists to the
      // lookup. Issue #562.
      const models = await import("../models/index.js");
      const user = await models.sequelize.transaction(async (t) => {
        await models.sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
          replacements: { tid: tenant_id },
          transaction: t,
        });
        return User.findOne({ where: { email: normalizedOrgEmail }, transaction: t });
      });
      logger.info(`[Login] Tenant context set: ${tenant_id}`);
      if (!user) {
        await verifyDummy(password);
        logger.info("[Login] Org-scoped: no user for email", { organizationId });
        return res.status(401).json({ error: "Invalid credentials" });
      }

      let valid;
      if (user.passwordHash) {
        valid = await verifyPassword(user.passwordHash, password);
        if (valid) await upgradeHashIfNeeded(user, password, logger);
      } else {
        // OAuth-only account: cannot password-login. Equalise timing,
        // then fail, rather than passing null into verifyPassword.
        await verifyDummy(password);
        valid = false;
      }
      if (!valid) {
        logger.info("[Login] Org-scoped: invalid password", { userId: user.id, organizationId });
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // #804: check membership table so a user can belong to multiple orgs.
      // Query outside the RLS tenant transaction; the membership table has no
      // RLS policy and must be readable across tenant boundaries here.
      const membership = await UserOrganizationMembership.findOne({
        where: { userId: user.id, organizationId },
      });

      if (!membership) {
        logger.info("[Login] Org-scoped: no membership in org", {
          userId: user.id,
          organizationId,
        });
        return res.status(403).json({ error: "You do not have access to this organisation" });
      }

      if (!membership.isApproved) {
        logger.info("[Login] Org-scoped: membership not approved", {
          userId: user.id,
          organizationId,
        });
        return res.status(403).json({
          error:
            "Your account is pending approval. An administrator will notify you by email when your account is activated.",
          code: "ACCOUNT_PENDING",
        });
      }

      logger.info("[Login] Org-scoped success", { userId: user.id, organizationId });

      const { generateToken, createSession, ACCESS_TOKEN_TTL_MS } =
        await import("../middleware/auth.js");

      const { token, jti: accessJti } = generateToken(user.id, organizationId);
      await createSession(accessJti, user.id, organizationId, "access", ACCESS_TOKEN_TTL_MS);
      await user.update({ lastActiveAt: new Date() });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          isAnonymous: user.isAnonymous,
          isAdmin: membership.isAdmin,
          isSuperuser: membership.isSuperuser,
          isPlatformOwner: !!(
            process.env.PLATFORM_OWNER_ID && user.id === process.env.PLATFORM_OWNER_ID
          ),
          hasSeenSuperuserWalkthrough: user.hasSeenSuperuserWalkthrough,
          hasSeenAdminWalkthrough: user.hasSeenAdminWalkthrough,
          hasSeenUserWalkthrough: user.hasSeenUserWalkthrough,
          superuserWalkthroughStep: user.superuserWalkthroughStep ?? null,
          adminWalkthroughStep: user.adminWalkthroughStep ?? null,
          userWalkthroughStep: user.userWalkthroughStep ?? null,
          organizationId,
        },
      });
    } catch (err) {
      res.status(500).json(formatServerError(err, "Login failed", "[Login] Error during login:"));
    }
  }
);

// #490: Logout invalidates the current token by revoking its session record.
// authenticate (mounted in index.js) sets req.jti before this handler runs.
protectedRouter.post(
  "/logout",
  auditLogger({ action: "auth.logout", resourceType: "auth", requireAuth: true }),
  async (req, res) => {
    const logger = createLogger(req);
    try {
      if (!req.jti) {
        // Pre-deploy token has no jti; cannot be server-side revoked. Client
        // should discard the token locally. Respond success to avoid leaking
        // that the token is legacy.
        logger.info("[Logout] No jti on token; skipping DB revocation.", { userId: req.user?.id });
        return res.json({ success: true });
      }
      const { revokeSession } = await import("../middleware/auth.js");
      await revokeSession(req.jti);
      logger.info("[Logout] Session revoked:", { jti: req.jti, userId: req.user?.id });
      res.json({ success: true });
    } catch (err) {
      logger.error("[Logout] Failed to revoke session:", { message: err.message });
      res.status(500).json({ error: "Logout failed" });
    }
  }
);

// Get current authenticated user. authenticate runs at the mount in
// index.js, so by the time this handler fires req.user is populated
// (or the request has already been rejected with 401).
protectedRouter.get("/me", async (req, res) => {
  const logger = createLogger(req);
  const user = req.user;
  const payload = {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    isSuperuser: user.isSuperuser,
    isPlatformOwner: !!(process.env.PLATFORM_OWNER_ID && user.id === process.env.PLATFORM_OWNER_ID),
    email: user.email,
    organizationId: user.organizationId,
    // Phase 3 Slice 2: the tour gate and org-picker (Slice 4) key off these.
    // /me is re-fetched on every returning session and overwrites the auth
    // context user; omitting them made the tour re-trigger on every reload
    // (the flags default false in JS for a missing key). Demo tokens build
    // req.user from JWT claims and have no row, so these are false for demo
    // by design (no server persistence; plan locked decision #8).
    hasSeenSuperuserWalkthrough: !!user.hasSeenSuperuserWalkthrough,
    hasSeenAdminWalkthrough: !!user.hasSeenAdminWalkthrough,
    hasSeenUserWalkthrough: !!user.hasSeenUserWalkthrough,
    superuserWalkthroughStep: user.superuserWalkthroughStep ?? null,
    adminWalkthroughStep: user.adminWalkthroughStep ?? null,
    userWalkthroughStep: user.userWalkthroughStep ?? null,
    primaryOrganizationId: user.primaryOrganizationId ?? null,
  };

  // resolveTenant runs before authenticate so req.tenant is only populated
  // when the org ID appears in the URL. For /me the org comes from the JWT,
  // so we do a direct lookup here if needed.
  const tenant = req.tenant ?? (await getTenantByOrganizationId(user.organizationId));
  if (tenant?.status === "trial" || tenant?.status === "trial_expired") {
    payload.trialEndsAt = tenant.trial_ends_at;
    payload.trialExpired = tenant.status === "trial_expired";
  }

  logger.info("[/auth/me] Returning user payload:", payload);
  res.json(payload);
});

// #804: list approved org memberships for the current user, including org names.
protectedRouter.get("/memberships", async (req, res) => {
  try {
    const memberships = await UserOrganizationMembership.findAll({
      where: { userId: req.user.id, isApproved: true },
      attributes: ["organizationId", "isAdmin", "isSuperuser"],
    });
    const orgIds = memberships.map((m) => m.organizationId);
    const orgs = await Organization.findAll({
      where: { organizationId: orgIds },
      attributes: ["organizationId", "organizationName"],
    });
    const nameMap = Object.fromEntries(orgs.map((o) => [o.organizationId, o.organizationName]));
    // Onboarding plan: the multi-org picker pre-selects the user's primary org.
    // Fetched explicitly rather than from req.user, whose shape differs between
    // the findByPk and demo/payload branches of authenticate.
    const me = await User.findByPk(req.user.id, { attributes: ["primaryOrganizationId"] });
    return res.json({
      primaryOrganizationId: me?.primaryOrganizationId ?? null,
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        orgName: nameMap[m.organizationId] || m.organizationId,
        isAdmin: m.isAdmin,
        isSuperuser: m.isSuperuser,
      })),
    });
  } catch (err) {
    return res
      .status(500)
      .json(formatServerError(err, "Failed to fetch memberships", "[Memberships]"));
  }
});

// #804: issue a short-lived pick token so a logged-in user can switch to
// another org without re-entering credentials. The token carries only the
// user id and a step marker; no org claim until select-org exchanges it.
protectedRouter.post("/org-switch/token", (req, res) => {
  const pickToken = jwt.sign({ id: req.user.id, step: "org-pick" }, process.env.JWT_SECRET, {
    expiresIn: "5m",
    algorithm: "HS256",
  });
  return res.json({ pickToken });
});

// #804: exchange a pick token + org choice for a full JWT pair. Used by the
// login page on the target org's subdomain after an org-switch redirect.
router.post(
  "/select-org",
  [
    body("pickToken").notEmpty().withMessage("pickToken is required"),
    body("organizationId").notEmpty().withMessage("organizationId is required"),
    handleValidationErrors,
  ],
  async (req, res) => {
    const logger = createLogger(req);
    const { pickToken, organizationId } = req.body;
    try {
      let payload;
      try {
        payload = jwt.verify(pickToken, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      } catch {
        return res.status(401).json({ error: "Invalid or expired pick token" });
      }

      if (payload.step !== "org-pick") {
        return res.status(401).json({ error: "Invalid token type" });
      }

      const user = await User.findByPk(payload.id);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const membership = await UserOrganizationMembership.findOne({
        where: { userId: user.id, organizationId, isApproved: true },
      });
      if (!membership) {
        logger.info(`[OrgSwitch] User ${user.id} has no approved membership in ${organizationId}`);
        return res.status(403).json({ error: "You do not have access to this organisation" });
      }

      // Onboarding plan: the org chosen at the picker becomes the user's
      // primary (last choice wins), so it is pre-selected next login.
      if (user.primaryOrganizationId !== organizationId) {
        await user.update({ primaryOrganizationId: organizationId });
      }

      const { generateToken, createSession, ACCESS_TOKEN_TTL_MS } =
        await import("../middleware/auth.js");

      const { token, jti: accessJti } = generateToken(user.id, organizationId);
      await createSession(accessJti, user.id, organizationId, "access", ACCESS_TOKEN_TTL_MS);
      await user.update({ lastActiveAt: new Date() });

      logger.info(`[OrgSwitch] User ${user.id} switched to org: ${organizationId}`);
      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          isAnonymous: user.isAnonymous,
          isAdmin: membership.isAdmin,
          isSuperuser: membership.isSuperuser,
          isPlatformOwner: !!(
            process.env.PLATFORM_OWNER_ID && user.id === process.env.PLATFORM_OWNER_ID
          ),
          hasSeenSuperuserWalkthrough: user.hasSeenSuperuserWalkthrough,
          hasSeenAdminWalkthrough: user.hasSeenAdminWalkthrough,
          hasSeenUserWalkthrough: user.hasSeenUserWalkthrough,
          superuserWalkthroughStep: user.superuserWalkthroughStep ?? null,
          adminWalkthroughStep: user.adminWalkthroughStep ?? null,
          userWalkthroughStep: user.userWalkthroughStep ?? null,
          organizationId,
        },
      });
    } catch (err) {
      return res.status(500).json(formatServerError(err, "Org switch failed", "[OrgSwitch]"));
    }
  }
);
