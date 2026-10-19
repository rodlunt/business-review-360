import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";
import UserOrganizationMembership from "../models/UserOrganizationMembership.js";
import { createLogger } from "../utils/logger.js";

// Parse JWT expiry strings like "7d", "30d", "1h" to milliseconds.
const parseTtlMs = (str = "7d") => {
  const m = String(str).match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  return parseInt(m[1]) * mult[m[2]];
};

const ACCESS_TTL_MS = parseTtlMs(process.env.JWT_EXPIRATION || "7d");

// #490: generateToken now returns { token, jti } so callers can persist the
// session record. The jti claim is a UUID that uniquely identifies the token;
// authenticate checks the UserSessions table to enforce revocation.
export const generateToken = (userId, organizationId) => {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ id: userId, organizationId, jti }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRATION || "7d",
    algorithm: "HS256",
  });
  return { token, jti };
};

// Persist an issued token as a session record.
export const createSession = (jti, userId, organizationId, type, ttlMs) =>
  UserSession.create({
    jti,
    userId,
    organizationId,
    type,
    expiresAt: new Date(Date.now() + ttlMs),
  });

// Revoke a single session by jti (used by logout).
export const revokeSession = (jti) =>
  UserSession.update({ revokedAt: new Date() }, { where: { jti } });

// Revoke all active sessions for a user (used by password change).
export const revokeAllSessions = (userId) =>
  UserSession.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });

export const ACCESS_TOKEN_TTL_MS = ACCESS_TTL_MS;

// Fixed UUIDs for the demo-corp fixture users. Using stable IDs means
// demo visitor activity (votes, ideas) is attributed to a real user row
// under demo-corp and is cleaned up by the nightly demo reset job.
const DEMO_USER_UUID = "55555555-5555-5555-5555-555555555555"; // dcuser
const DEMO_ADMIN_UUID = "66666666-6666-6666-6666-666666666666"; // dcadmin

// Issue #566: short-lived (2h) demo token for the shared demo-corp org.
// No session row is created; authenticate short-circuits the DB lookup below.
export const generateDemoToken = (demoRole = "user", visitorEmail = null) => {
  const userId = demoRole === "admin" ? DEMO_ADMIN_UUID : DEMO_USER_UUID;
  const token = jwt.sign(
    {
      id: userId,
      organizationId: "demo-corp",
      demo: true,
      demoRole,
      ...(visitorEmail && { visitorEmail }),
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h", algorithm: "HS256" }
  );
  return {
    token,
    user: {
      id: userId,
      username: "Demo Visitor",
      email: visitorEmail || null,
      organizationId: "demo-corp",
      isAdmin: demoRole === "admin",
      isSuperuser: demoRole === "admin",
      isDemo: true,
      demoRole,
      visitorEmail: visitorEmail || null,
    },
  };
};

export const authenticate = async (req, res, next) => {
  const logger = createLogger(req);
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  logger.info("[Auth] Request URL:", { url: req.url });
  logger.info("[Auth] Authorization header:", {
    state: authHeader ? "present" : "MISSING",
  });
  logger.info("[Auth] Token:", { state: token ? "present" : "MISSING" });

  if (!token) {
    logger.info("[Auth] No token provided, returning 401");
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // #490: opportunistic revocation: only explicitly revoked sessions are
    // rejected. Tokens without a jti claim (pre-deploy) and tokens whose session
    // record has been cleaned up pass through. This avoids a hard cutover that
    // would log out all users at deploy time. Pre-deploy tokens expire naturally
    // within JWT_EXPIRATION (default 7d); new logins get tracked sessions.
    if (payload.jti) {
      const session = await UserSession.findOne({ where: { jti: payload.jti } });
      if (session && session.revokedAt !== null) {
        return res.status(401).json({ error: "Token revoked", code: "TOKEN_REVOKED" });
      }
    }

    // #566: Demo tokens carry demo:true. Skip DB lookups and construct req.user
    // directly from the payload. Demo tokens have no session row.
    if (payload.demo === true) {
      req.user = {
        id: payload.id,
        organizationId: payload.organizationId,
        isAdmin: payload.demoRole === "admin",
        isSuperuser: payload.demoRole === "admin",
        isDemo: true,
        demoRole: payload.demoRole || "user",
        visitorEmail: payload.visitorEmail || null,
        username: "Demo Visitor",
      };
      req.jti = null;
      logger.info("[Auth] Demo token accepted:", { demoRole: payload.demoRole });
      return next();
    }

    const user = await User.findByPk(payload.id);
    logger.info("[Auth] User found:", {
      user: user ? `${user.username} (${user.id})` : "NO USER FOUND",
    });

    if (!user) {
      logger.info("[Auth] User not found for id:", { id: payload.id });
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    req.jti = payload.jti;

    // #804: active session org lives in the JWT, not necessarily in
    // user.organizationId (home org). Override so all downstream middleware
    // (requireSameOrganization, tenant guard, RLS context) sees the correct org.
    // #817: capture homeOrgId BEFORE mutating req.user.organizationId (req.user
    // and user are the same object reference, so the mutation would otherwise
    // make the guard below always false).
    const homeOrgId = user.organizationId;
    const activeOrgId = payload.organizationId || homeOrgId;
    req.user.organizationId = activeOrgId;

    // Load per-org role flags from the membership row only when the active org
    // differs from the user's home org (multi-org session). For single-org
    // users the User-level flags are already correct and the lookup is skipped,
    // which also preserves compatibility with existing tests that mock User
    // but not UserOrganizationMembership.
    if (activeOrgId !== homeOrgId) {
      const membership = await UserOrganizationMembership.findOne({
        where: { userId: user.id, organizationId: activeOrgId },
      });
      if (membership) {
        req.user.isAdmin = membership.isAdmin;
        req.user.isSuperuser = membership.isSuperuser;
      }
    }

    logger.info("[Auth] req.user set successfully:", { username: req.user.username });
    logger.info("[Auth] User organizationId:", { organizationId: req.user.organizationId });

    // #751: Defence-in-depth backstop for the cross-tenant guard. The
    // load-bearing check is verifyTenantUserMatch (mounted globally on /api
    // before wrapTenantTransaction), which runs a JWT-only match before the
    // role-switch / RLS scope is established. This in-authenticate check
    // catches the same mismatch from the DB-loaded req.user, so any future
    // path that reaches authenticate with req.tenant set still gets the 403
    // even if the global middleware was bypassed for some reason.
    if (req.tenant && req.user.organizationId !== req.tenant.org_id) {
      logger.warn("[Auth] User/tenant mismatch:", {
        userId: req.user.id,
        username: req.user.username,
        userOrg: req.user.organizationId,
        tenantOrg: req.tenant.org_id,
      });
      return res.status(403).json({
        error: "You do not have access to this organization's data.",
        code: "TENANT_ACCESS_DENIED",
      });
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Issue #769: superuser role gates org settings, branding, export, and profanity config.
// Superusers always also have isAdmin=true; requireAdmin checks still pass for them.
export const requireSuperuser = (req, res, next) => {
  if (!req.user || !req.user.isSuperuser) {
    return res.status(403).json({ error: "Superuser access required" });
  }
  next();
};

// Gates routes to the platform owner only (PLATFORM_OWNER_ID env var).
// Cannot be granted to other users; survives DB resets.
export const requirePlatformOwner = (req, res, next) => {
  const ownerId = process.env.PLATFORM_OWNER_ID;
  if (!ownerId || !req.user || req.user.id !== ownerId) {
    return res.status(403).json({ error: "Platform owner access required" });
  }
  next();
};

// Middleware to ensure user can only access their own organization's data
export const requireSameOrganization = (req, res, next) => {
  const logger = createLogger(req);
  logger.info("[Security] requireSameOrganization called");
  logger.info("[Security] req.user exists:", { exists: !!req.user });

  if (!req.user) {
    logger.error("[Security] requireSameOrganization called but req.user is undefined");
    return res.status(401).json({ error: "Authentication required" });
  }

  logger.info("[Security] req.user details:", {
    details: `${req.user.username} (${req.user.id}, org: ${req.user.organizationId})`,
  });

  const organizationId =
    (req.params && req.params.organizationId) ||
    (req.query && req.query.organizationId) ||
    (req.body && req.body.organizationId);

  if (!req.user.organizationId) {
    logger.warn("[Security] User missing organizationId:", {
      userId: req.user.id,
      username: req.user.username,
    });
    return res.status(403).json({
      error: "User account is missing organization information. Please contact support.",
    });
  }

  if (organizationId && req.user.organizationId !== organizationId) {
    logger.warn("[Security] Cross-org access attempt blocked:", {
      userId: req.user.id,
      username: req.user.username,
      userOrg: req.user.organizationId,
      requestedOrg: organizationId,
      method: req.method,
      path: req.path,
    });
    return res.status(403).json({
      error: "You do not have access to this organization's data.",
      code: "TENANT_MISMATCH",
    });
  }

  next();
};
