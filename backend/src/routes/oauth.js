// OAuth 2.0 social login + enterprise Azure AD SSO.
// Implements the full code-exchange flow without passport (stateless backend).
// State is a signed JWT so no server-side session is required.

import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import OAuthLink from "../models/OAuthLink.js";
import Organization from "../models/Organization.js";
import UserOrganizationMembership from "../models/UserOrganizationMembership.js";
import {
  generateToken,
  createSession,
  authenticate,
  ACCESS_TOKEN_TTL_MS,
} from "../middleware/auth.js";
import { getTenantByOrganizationId } from "../middleware/tenantResolver.js";
import { createLogger } from "../utils/logger.js";
import { formatServerError } from "../utils/formatServerError.js";
import { sendRawEmail } from "../emails/utils/sendEmail.js";
import { notifyEvent } from "../utils/ntfy.js";

export const publicRouter = express.Router();
export const protectedRouter = express.Router();

// ---------------------------------------------------------------------------
// Provider configurations: read from env at request time so vars can be
// set after module load (e.g. from Key Vault bootstrap).
// ---------------------------------------------------------------------------
function getBaseProviderConfig(provider) {
  const configs = {
    google: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      profileUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      scope: "openid email profile",
      extraAuthParams: { access_type: "online", prompt: "select_account" },
    },
    github: {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      profileUrl: "https://api.github.com/user",
      emailsUrl: "https://api.github.com/user/emails",
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: "read:user user:email",
    },
    microsoft: {
      authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      profileUrl: "https://graph.microsoft.com/v1.0/me",
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      scope: "openid email profile User.Read",
      extraAuthParams: { prompt: "select_account" },
    },
  };
  return configs[provider] || null;
}

function getProviderConfig(provider, org) {
  if (provider === "azure-ad") {
    const tenantId = org?.ssoAzureTenantId;
    if (!tenantId) return null;
    return {
      authUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      profileUrl: "https://graph.microsoft.com/v1.0/me",
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      scope: "openid email profile User.Read",
    };
  }
  return getBaseProviderConfig(provider);
}

// Map provider → org field that enables it.
const PROVIDER_ENABLED_FIELD = {
  google: "oauthGoogleEnabled",
  github: "oauthGithubEnabled",
  microsoft: "oauthMicrosoftEnabled",
  "azure-ad": "ssoAzureEnabled",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const callbackBase = () =>
  process.env.OAUTH_CALLBACK_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

const frontendBase = () => process.env.FRONTEND_URL || "http://localhost:3000";

// Derives the admin subdomain URL from ADMIN_URL env or by prefixing the
// frontend host with "admin.". br360.example.com has no www host any more, so
// this can no longer substitute www→admin; it inserts the admin label in
// front of whatever host FRONTEND_URL carries instead.
const adminBase = () =>
  process.env.ADMIN_URL || frontendBase().replace(/^(https?:\/\/)/, "$1admin.");

function buildRedirectUri(provider) {
  return `${callbackBase()}/api/auth/oauth/${provider}/callback`;
}

function buildFrontendCallbackUrl(orgId, params) {
  const query = new URLSearchParams(params).toString();
  return `${frontendBase()}/org/${orgId}/oauth-callback?${query}`;
}

function signState(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "10m",
    algorithm: "HS256",
  });
}

function verifyState(state) {
  return jwt.verify(state, process.env.JWT_SECRET, { algorithms: ["HS256"] });
}

// Sanitise a display name / email local-part into a valid username.
// Rules: 3-50 chars, alphanumeric + - and _.
export function sanitiseUsername(raw) {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base.length >= 3 ? base : base.padEnd(3, "0");
}

export async function findUniqueUsername(display, email) {
  const base = sanitiseUsername(display || email?.split("@")[0] || "user");
  let candidate = base;
  for (let i = 0; i < 6; i++) {
    const exists = await User.findOne({ where: { username: candidate } });
    if (!exists) return candidate;
    candidate = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error("Unable to generate a unique username, try again.");
}

// Exchange an authorisation code for provider tokens.
async function exchangeCode(config, code, redirectUri) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

// Fetch user profile from the provider's userinfo endpoint.
async function fetchProfile(config, accessToken) {
  const resp = await fetch(config.profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "businessreview360 (+https://br360.example.com)",
    },
  });
  if (!resp.ok) throw new Error(`Profile fetch failed (${resp.status})`);
  return resp.json();
}

// For GitHub, email is optional on the profile; fetch the verified primary.
async function fetchGithubEmail(accessToken) {
  const resp = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "businessreview360",
    },
  });
  if (!resp.ok) return null;
  const emails = await resp.json();
  const primary = emails.find((e) => e.primary && e.verified);
  return primary?.email || null;
}

// Extract a normalised { id, email, displayName } from provider profile.
function normaliseProfile(provider, profile) {
  if (provider === "google") {
    return { id: profile.sub, email: profile.email, displayName: profile.name };
  }
  if (provider === "github") {
    return {
      id: String(profile.id),
      email: profile.email,
      displayName: profile.login,
    };
  }
  if (provider === "microsoft" || provider === "azure-ad") {
    return {
      id: profile.id,
      email: profile.mail || profile.userPrincipalName,
      displayName: profile.displayName,
    };
  }
  return { id: null, email: null, displayName: null };
}

// Issue access token + create session record, return { token }.
// Pass organizationId explicitly so multi-org sessions use the correct org.
async function issueTokens(user, organizationId) {
  const orgId = organizationId || user.organizationId;
  const { token, jti } = generateToken(user.id, orgId);
  await createSession(jti, user.id, orgId, "access", ACCESS_TOKEN_TTL_MS);
  // #892 follow-up: every OAuth-driven session start is an active login event
  // (both the regular callback and the admin-console callback flow through
  // here). Re-engagement segmentation depends on this being written.
  await user.update({ lastActiveAt: new Date() });
  return { token };
}

// ---------------------------------------------------------------------------
// Initiation: GET /api/auth/oauth/:provider?org=<orgId>
// ---------------------------------------------------------------------------
publicRouter.get("/:provider", async (req, res) => {
  const logger = createLogger(req);
  const { provider } = req.params;
  const orgId = req.query.org;

  // Admin console login: uses platform-level credentials, bypasses per-org config.
  if (req.query.adminRedirect === "1") {
    if (!PROVIDER_ENABLED_FIELD[provider]) {
      return res.status(400).json({ error: "Unknown provider" });
    }
    const config = getBaseProviderConfig(provider);
    if (!config?.clientId) {
      logger.error(`[OAuth] Admin login: provider ${provider} has no clientId configured`);
      return res.status(503).json({ error: "OAuth provider not configured" });
    }
    const state = signState({ adminRedirect: true, nonce: crypto.randomUUID(), action: "login" });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: buildRedirectUri(provider),
      response_type: "code",
      scope: config.scope,
      state,
      ...(config.extraAuthParams || {}),
    });
    logger.info(`[OAuth] Initiating admin ${provider} login`);
    return res.redirect(`${config.authUrl}?${params}`);
  }

  if (!PROVIDER_ENABLED_FIELD[provider]) {
    return res.status(400).json({ error: "Unknown provider" });
  }

  // #892 PR4: org-less initiate. Reached from the main-domain /login OAuth
  // buttons (no subdomain, no tenant context). Azure SSO is per-tenant config
  // and cannot be used here; platform-level providers (Google / GitHub /
  // Microsoft) read their clientId from env, exactly the same way the admin
  // login above does. The callback verifies the noOrg flag and runs the
  // email-lookup branch instead of the org-scoped lookup.
  if (!orgId) {
    if (provider === "azure-ad") {
      return res.status(400).json({
        error:
          "Azure SSO requires an organisation. Please sign in via your organisation's subdomain.",
      });
    }
    const baseConfig = getBaseProviderConfig(provider);
    if (!baseConfig?.clientId) {
      logger.error(`[OAuth] No-org login: provider ${provider} has no clientId configured`);
      return res.status(503).json({ error: "OAuth provider not configured" });
    }
    const state = signState({ noOrg: true, nonce: crypto.randomUUID(), action: "login" });
    const params = new URLSearchParams({
      client_id: baseConfig.clientId,
      redirect_uri: buildRedirectUri(provider),
      response_type: "code",
      scope: baseConfig.scope,
      state,
      ...(baseConfig.extraAuthParams || {}),
    });
    logger.info(`[OAuth] Initiating no-org ${provider} login`);
    return res.redirect(`${baseConfig.authUrl}?${params}`);
  }

  try {
    const org = await Organization.findOne({ where: { organizationId: orgId } });
    if (!org) return res.status(404).json({ error: "Organisation not found" });

    const enabledField = PROVIDER_ENABLED_FIELD[provider];
    if (!org[enabledField]) {
      return res.status(400).json({ error: "Provider not enabled for this organisation" });
    }

    const config = getProviderConfig(provider, org);
    if (!config?.clientId) {
      logger.error(`[OAuth] Provider ${provider} has no clientId configured`);
      return res.status(503).json({ error: "OAuth provider not configured" });
    }

    const state = signState({ orgId, nonce: crypto.randomUUID(), action: "login" });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: buildRedirectUri(provider),
      response_type: "code",
      scope: config.scope,
      state,
      ...config.extraAuthParams,
    });

    logger.info(`[OAuth] Initiating ${provider} login for org ${orgId}`);
    return res.redirect(`${config.authUrl}?${params}`);
  } catch (err) {
    logger.error(`[OAuth] Initiation error for ${provider}`, err);
    return res.status(500).json(formatServerError(err, "OAuth initiation failed", "[OAuth]"));
  }
});

// ---------------------------------------------------------------------------
// Callback: GET /api/auth/oauth/:provider/callback
// ---------------------------------------------------------------------------
publicRouter.get("/:provider/callback", async (req, res) => {
  const logger = createLogger(req);
  const { provider } = req.params;
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    logger.warn(`[OAuth] Provider returned error: ${oauthError}`);
    return res.redirect(buildFrontendCallbackUrl("unknown", { error: oauthError }));
  }

  if (!code || !state) {
    return res.redirect(buildFrontendCallbackUrl("unknown", { error: "missing_params" }));
  }

  let statePayload;
  try {
    statePayload = verifyState(state);
  } catch {
    return res.redirect(buildFrontendCallbackUrl("unknown", { error: "invalid_state" }));
  }

  const { orgId, action, linkUserId, adminRedirect } = statePayload;

  // Admin console callback: verify superuser, redirect to admin subdomain.
  if (adminRedirect) {
    try {
      const config = getBaseProviderConfig(provider);
      if (!config?.clientId) {
        logger.error(`[OAuth] Admin callback: provider ${provider} not configured`);
        return res.redirect(`${adminBase()}/login?error=provider_not_configured`);
      }

      const tokenData = await exchangeCode(config, code, buildRedirectUri(provider));
      if (tokenData.error) {
        logger.error(`[OAuth] Admin callback token exchange error: ${tokenData.error_description}`);
        return res.redirect(`${adminBase()}/login?error=token_exchange_failed`);
      }

      let rawProfile = await fetchProfile(config, tokenData.access_token);
      if (provider === "github" && !rawProfile.email) {
        rawProfile.email = await fetchGithubEmail(tokenData.access_token);
      }
      const profile = normaliseProfile(provider, rawProfile);
      if (!profile.id) {
        return res.redirect(`${adminBase()}/login?error=invalid_profile`);
      }

      const oauthLink = await OAuthLink.findOne({
        where: { provider, providerId: String(profile.id) },
      });
      if (!oauthLink) {
        logger.warn(`[OAuth] Admin login: no OAuth link for ${provider} id=${profile.id}`);
        return res.redirect(`${adminBase()}/login?error=not_authorised`);
      }

      const user = await User.findByPk(oauthLink.userId);
      if (!user || !user.isSuperuser) {
        logger.warn(`[OAuth] Admin login rejected: not a superuser`, { userId: user?.id });
        return res.redirect(`${adminBase()}/login?error=not_authorised`);
      }

      const { token } = await issueTokens(user, user.organizationId);
      logger.info(`[OAuth] Admin login successful for user ${user.id} (${user.username})`);
      const qs = new URLSearchParams({ token }).toString();
      return res.redirect(`${adminBase()}/oauth-callback?${qs}`);
    } catch (err) {
      logger.error(`[OAuth] Admin callback error for ${provider}`, err);
      return res.redirect(`${adminBase()}/login?error=server_error`);
    }
  }

  // #892 PR4: no-org callback branch. Reached when the user clicked an OAuth
  // button on the main-domain /login (no tenant context in state). Look the
  // identity up by email post-OAuth and route on what's found:
  //   - 0 User rows   -> create one in the shared self-serve tenant
  //                      (signupSource='oauth-no-org', NO membership);
  //                      redirect to /login with a welcome banner.
  //   - 1 row, 0 approved memberships -> same welcome flow (no session).
  //   - 1 row, 1 approved membership  -> issue a real session and redirect
  //                                       to that org's subdomain (reuses
  //                                       the existing org-scoped callback
  //                                       URL).
  //   - 1 row, 2+ memberships         -> stop-gap: redirect to /login with
  //                                       msg=oauth-multi-org. Full multi-org
  //                                       OAuth picker is a follow-up.
  //   - >1 rows                       -> fail closed (split identity, same
  //                                       posture as the org-less /auth/login
  //                                       guard).
  if (statePayload.noOrg) {
    const frontendLogin = `${frontendBase()}/login`;
    try {
      const baseConfig = getBaseProviderConfig(provider);
      if (!baseConfig?.clientId) {
        logger.error(`[OAuth] No-org callback: provider ${provider} not configured`);
        return res.redirect(`${frontendLogin}?error=provider_not_configured`);
      }

      const tokenData = await exchangeCode(baseConfig, code, buildRedirectUri(provider));
      if (tokenData.error) {
        logger.error(`[OAuth] No-org token exchange error: ${tokenData.error_description}`);
        return res.redirect(`${frontendLogin}?error=token_exchange_failed`);
      }

      let rawProfile = await fetchProfile(baseConfig, tokenData.access_token);
      if (provider === "github" && !rawProfile.email) {
        rawProfile.email = await fetchGithubEmail(tokenData.access_token);
      }
      const profile = normaliseProfile(provider, rawProfile);
      if (!profile.id) {
        return res.redirect(`${frontendLogin}?error=invalid_profile`);
      }
      if (!profile.email) {
        logger.warn(`[OAuth] No-org: provider ${provider} returned no email`);
        return res.redirect(`${frontendLogin}?error=no_email_from_provider`);
      }

      const normalizedEmail = profile.email.trim().toLowerCase();
      const firstName = (profile.displayName || profile.email.split("@")[0]).split(" ")[0];
      const welcomeQs = new URLSearchParams({
        msg: "oauth-no-org",
        name: firstName,
      }).toString();

      // Cross-tenant User lookup. Phase 5 identity is single-row-per-email
      // (post-#858); >1 means legacy split identity and must fail closed.
      const users = await User.findAll({ where: { email: normalizedEmail } });

      if (users.length > 1) {
        logger.error(
          `[OAuth] No-org SPLIT IDENTITY: ${users.length} User rows for ${profile.email}`
        );
        return res.redirect(`${frontendLogin}?error=split_identity`);
      }

      if (users.length === 0) {
        // Brand new identity. Create a User row in the shared self-serve
        // tenant (demo-corp); no membership granted. Email + signupSource
        // are captured for platform-owner follow-up. The frontend welcome
        // banner points them at the demo CTA or the admin-invite hint.
        const demoOrgId = process.env.DEMO_ORG_ID || "demo-corp";
        const tenant = await getTenantByOrganizationId(demoOrgId);
        if (!tenant) {
          logger.error("[OAuth] No-org: demo-corp tenant not configured");
          return res.redirect(`${frontendLogin}?error=server_error`);
        }
        const username = await findUniqueUsername(profile.displayName, profile.email);
        const newUser = await User.create({
          username,
          passwordHash: null,
          email: normalizedEmail,
          organizationId: null,
          tenant_id: tenant.id,
          isAnonymous: false,
          isApproved: true,
          signupSource: "oauth-no-org",
          companyName: null,
          lastActiveAt: new Date(),
        });
        await OAuthLink.create({
          userId: newUser.id,
          organizationId: null,
          provider,
          providerId: String(profile.id),
          providerEmail: profile.email,
        });

        notifyEvent(
          `OAuth no-org signup: ${username}`,
          `${normalizedEmail}\nProvider: ${provider}\nName: ${profile.displayName || "(none)"}`
        ).catch(() => {});

        logger.info(`[OAuth] No-org: created new User ${newUser.id} (no membership)`);
        return res.redirect(`${frontendLogin}?${welcomeQs}`);
      }

      // users.length === 1
      const user = users[0];
      const memberships = await UserOrganizationMembership.findAll({
        where: { userId: user.id, isApproved: true },
      });

      if (memberships.length === 0) {
        // Existing identity, no approved memberships. Welcome flow; no
        // session. (User row already exists, no need to create.)
        logger.info(`[OAuth] No-org: existing User ${user.id} has no approved memberships`);
        return res.redirect(`${frontendLogin}?${welcomeQs}`);
      }

      if (memberships.length === 1) {
        // Single approved org. Issue a real session for that org and hop
        // to the subdomain via the existing frontend OAuth callback URL.
        const targetOrgId = memberships[0].organizationId;
        const { token } = await issueTokens(user, targetOrgId);
        logger.info(`[OAuth] No-org: signed in user ${user.id} to ${targetOrgId}`);
        return res.redirect(buildFrontendCallbackUrl(targetOrgId, { token }));
      }

      // Multi-org: deferred. Surface a discoverable stop-gap.
      logger.info(
        `[OAuth] No-org: user ${user.id} has ${memberships.length} memberships; multi-org OAuth not yet supported`
      );
      return res.redirect(`${frontendLogin}?msg=oauth-multi-org`);
    } catch (err) {
      logger.error(`[OAuth] No-org callback error for ${provider}`, err);
      return res.redirect(`${frontendLogin}?error=server_error`);
    }
  }

  try {
    const org = await Organization.findOne({ where: { organizationId: orgId } });
    if (!org) {
      return res.redirect(buildFrontendCallbackUrl(orgId, { error: "org_not_found" }));
    }

    const config = getProviderConfig(provider, org);
    if (!config?.clientId) {
      return res.redirect(buildFrontendCallbackUrl(orgId, { error: "provider_not_configured" }));
    }

    // Exchange code for provider access token.
    const tokenData = await exchangeCode(config, code, buildRedirectUri(provider));
    if (tokenData.error) {
      logger.error(`[OAuth] Token exchange error: ${tokenData.error_description}`);
      return res.redirect(buildFrontendCallbackUrl(orgId, { error: "token_exchange_failed" }));
    }

    const accessToken = tokenData.access_token;

    // Fetch provider profile.
    let rawProfile = await fetchProfile(config, accessToken);

    // GitHub: fetch email separately if not in profile.
    if (provider === "github" && !rawProfile.email) {
      rawProfile.email = await fetchGithubEmail(accessToken);
    }

    const profile = normaliseProfile(provider, rawProfile);
    if (!profile.id) {
      return res.redirect(buildFrontendCallbackUrl(orgId, { error: "invalid_profile" }));
    }

    logger.info(
      `[OAuth] Profile received from ${provider}: id=${profile.id} email=${profile.email}`
    );

    // -----------------------------------------------------------------------
    // Link flow: attach this provider to an existing authenticated user.
    // -----------------------------------------------------------------------
    if (action === "link" && linkUserId) {
      const existing = await OAuthLink.findOne({
        where: { provider, providerId: profile.id, organizationId: orgId },
      });
      if (existing && existing.userId !== linkUserId) {
        return res.redirect(
          buildFrontendCallbackUrl(orgId, { error: "provider_already_linked_to_another_account" })
        );
      }
      if (!existing) {
        await OAuthLink.create({
          userId: linkUserId,
          organizationId: orgId,
          provider,
          providerId: profile.id,
          providerEmail: profile.email,
        });
      }
      logger.info(`[OAuth] Linked ${provider} to user ${linkUserId}`);
      return res.redirect(buildFrontendCallbackUrl(orgId, { linked: provider }));
    }

    // -----------------------------------------------------------------------
    // Sign-in flow: find or create user.
    // -----------------------------------------------------------------------

    // Check SSO domain restriction.
    if (provider === "azure-ad" && org.ssoAllowedDomains?.length > 0 && profile.email) {
      const domain = profile.email.split("@")[1]?.toLowerCase();
      const allowed = org.ssoAllowedDomains.map((d) => d.toLowerCase());
      if (!allowed.includes(domain)) {
        logger.warn(`[OAuth] Domain ${domain} not in ssoAllowedDomains for ${orgId}`);
        return res.redirect(buildFrontendCallbackUrl(orgId, { error: "domain_not_allowed" }));
      }
    }

    // Look up an existing link record.
    let oauthLink = await OAuthLink.findOne({
      where: { provider, providerId: profile.id, organizationId: orgId },
    });

    let user;
    let membership;
    if (oauthLink) {
      // #804: look up by userId only; home org may differ from the org being
      // signed into for multi-org users.
      user = await User.findByPk(oauthLink.userId);
      if (!user) {
        return res.redirect(buildFrontendCallbackUrl(orgId, { error: "user_not_found" }));
      }
      membership = await UserOrganizationMembership.findOne({
        where: { userId: user.id, organizationId: orgId },
      });
      if (!membership) {
        return res.redirect(buildFrontendCallbackUrl(orgId, { error: "no_membership" }));
      }
    } else {
      // New user via OAuth.
      if (!org.allowSelfRegistration) {
        return res.redirect(buildFrontendCallbackUrl(orgId, { error: "registration_disabled" }));
      }

      const tenant = await getTenantByOrganizationId(orgId);
      if (!tenant) {
        return res.redirect(buildFrontendCallbackUrl(orgId, { error: "tenant_not_found" }));
      }

      const username = await findUniqueUsername(profile.displayName, profile.email);
      const autoSuperuser = !!org.oauthAutoSuperuser;

      user = await User.create({
        username,
        passwordHash: null,
        email: profile.email,
        organizationId: orgId,
        tenant_id: tenant.id,
        isAnonymous: false,
        isApproved: true, // auto-approve OAuth signups
        // #892 follow-up: tag for lead-outreach segmentation. OAuth lands
        // here via the org-scoped callback (orgId is in the state payload),
        // so this is the "user signed in with OAuth on an org that allows
        // self-registration" path. The main-domain OAuth no-org flow will
        // use 'oauth-no-org' instead (future PR).
        signupSource: "oauth-self-register",
        ...(autoSuperuser && { isSuperuser: true }),
      });

      // #804: create membership row for the new user's org. New users created
      // after migration time are not covered by the backfill INSERT in 0012.
      membership = await UserOrganizationMembership.create({
        userId: user.id,
        organizationId: orgId,
        isAdmin: false,
        isApproved: true,
        isSuperuser: autoSuperuser,
      });

      oauthLink = await OAuthLink.create({
        userId: user.id,
        organizationId: orgId,
        provider,
        providerId: profile.id,
        providerEmail: profile.email,
      });

      logger.info(
        `[OAuth] Created new user ${user.id} (${username}) via ${provider} for org ${orgId}${autoSuperuser ? " [auto-superuser]" : ""}`
      );

      // Notify the platform owner so OAuth trial signups can be followed up as leads.
      const demoOrgId = process.env.DEMO_ORG_ID || "demo-corp";
      if (orgId === demoOrgId) {
        notifyEvent(
          `Demo lead (OAuth): ${username}`,
          `${profile.email || "(no email)"}\nProvider: ${provider}${profile.displayName ? `\nName: ${profile.displayName}` : ""}`
        ).catch(() => {});
      }

      const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL;
      if (notifyEmail && profile.email) {
        const signupTime = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
        sendRawEmail({
          to: notifyEmail,
          subject: `BR360 demo sign-up: ${profile.email} via ${provider}`,
          html: `<p>A new user signed up to <strong>${orgId}</strong> via <strong>${provider}</strong>.</p>
<ul>
  <li><strong>Email:</strong> ${profile.email}</li>
  <li><strong>Display name:</strong> ${profile.displayName || "(none)"}</li>
  <li><strong>Username:</strong> ${username}</li>
  <li><strong>Time (AEST):</strong> ${signupTime}</li>
</ul>
<p>This account will be removed in the next overnight reset.</p>`,
          text: `New demo sign-up on ${orgId} via ${provider}.\nEmail: ${profile.email}\nDisplay name: ${profile.displayName || "(none)"}\nUsername: ${username}\nTime (AEST): ${signupTime}\n\nThis account will be removed in the next overnight reset.`,
          categories: ["oauth-lead"],
        }).catch((err) => logger.warn("[OAuth] Lead notification email failed", err));
      }
    }

    // #804: check per-org approval status from the membership row.
    if (!membership.isApproved) {
      return res.redirect(buildFrontendCallbackUrl(orgId, { error: "account_pending_approval" }));
    }

    const { token } = await issueTokens(user, orgId);
    logger.info(`[OAuth] Signed in user ${user.id} via ${provider}`);

    // Redirect to frontend OAuth callback with token in query params.
    // The OAuthCallback component immediately reads and clears them.
    return res.redirect(buildFrontendCallbackUrl(orgId, { token }));
  } catch (err) {
    logger.error(`[OAuth] Callback error for ${provider}`, err);
    return res.redirect(buildFrontendCallbackUrl(orgId || "unknown", { error: "server_error" }));
  }
});

// ---------------------------------------------------------------------------
// Initiate link (authenticated): GET /api/auth/oauth/link/:provider
// ---------------------------------------------------------------------------
protectedRouter.get("/link/:provider", authenticate, async (req, res) => {
  const logger = createLogger(req);
  const { provider } = req.params;
  const orgId = req.user.organizationId;

  if (!PROVIDER_ENABLED_FIELD[provider]) {
    return res.status(400).json({ error: "Unknown provider" });
  }

  try {
    const org = await Organization.findOne({ where: { organizationId: orgId } });
    if (!org) return res.status(404).json({ error: "Organisation not found" });

    const config = getProviderConfig(provider, org);
    if (!config?.clientId) {
      return res.status(503).json({ error: "OAuth provider not configured" });
    }

    const state = signState({
      orgId,
      nonce: crypto.randomUUID(),
      action: "link",
      linkUserId: req.user.id,
    });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: buildRedirectUri(provider),
      response_type: "code",
      scope: config.scope,
      state,
      ...config.extraAuthParams,
    });

    logger.info(`[OAuth] Initiating ${provider} link for user ${req.user.id}`);
    return res.redirect(`${config.authUrl}?${params}`);
  } catch (err) {
    logger.error(`[OAuth] Link initiation error`, err);
    return res.status(500).json(formatServerError(err, "Link initiation failed", "[OAuth]"));
  }
});

// List linked providers: GET /api/auth/oauth/links
protectedRouter.get("/links", authenticate, async (req, res) => {
  try {
    const links = await OAuthLink.findAll({
      where: { userId: req.user.id, organizationId: req.user.organizationId },
      attributes: ["provider", "providerEmail", "createdAt"],
    });
    return res.json({ links: links.map((l) => l.toJSON()) });
  } catch (err) {
    return res
      .status(500)
      .json(formatServerError(err, "Failed to list linked providers", "[OAuth]"));
  }
});

// Unlink provider: DELETE /api/auth/oauth/links/:provider
protectedRouter.delete("/links/:provider", authenticate, async (req, res) => {
  const logger = createLogger(req);
  const { provider } = req.params;

  try {
    const user = await User.findOne({
      where: { id: req.user.id, organizationId: req.user.organizationId },
    });

    // Prevent unlinking if this is the only auth method (no password).
    const linkCount = await OAuthLink.count({ where: { userId: req.user.id } });
    if (!user.passwordHash && linkCount <= 1) {
      return res.status(400).json({
        error: "Cannot unlink the only login method; set a password first.",
      });
    }

    const deleted = await OAuthLink.destroy({
      where: {
        userId: req.user.id,
        organizationId: req.user.organizationId,
        provider,
      },
    });

    if (!deleted) return res.status(404).json({ error: "Provider not linked" });

    logger.info(`[OAuth] Unlinked ${provider} from user ${req.user.id}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error(`[OAuth] Unlink error`, err);
    return res.status(500).json(formatServerError(err, "Failed to unlink provider", "[OAuth]"));
  }
});
