// Application-layer cross-tenant guard (defence-in-depth layer 1).
// Issue: #751.
//
// Mounts globally on /api between resolveTenant and wrapTenantTransaction.
// Decodes the bearer JWT (no DB call, HS256-pinned), reads
// payload.organizationId, and compares it against req.tenant.org_id.
//
// On mismatch -> 403 TENANT_ACCESS_DENIED. On any other condition (no
// req.tenant, no token, bad token, missing organizationId in payload),
// pass through. The downstream authenticate middleware still owns the
// authoritative DB-backed user load and 401 path -- this middleware only
// adds the early 403 for the cross-tenant case.
//
// Why a JWT-only check, not a DB-backed one: wrapTenantTransaction runs
// global (#740) and switches the role to APP_DB_ROLE in prod, so
// User.findByPk inside authenticate is RLS-scoped to the *requested*
// tenant. A cross-tenant attacker's user row is filtered out, returning
// the misleading 401 "User not found" instead of 403 TENANT_ACCESS_DENIED.
// Running this check before the wrap entirely sidesteps the RLS scope.
// The JWT carries organizationId at issue time (auth.js generateToken),
// which is sufficient evidence for the application-layer match.
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger.js";

export const verifyTenantUserMatch = (req, res, next) => {
  // No tenant context (eg /api/auth/login, /api/billing, /api/contact, or
  // any route resolveTenant skipped) -> nothing to compare against.
  if (!req.tenant) return next();

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  // Unauthenticated request: let downstream authenticate handle the 401.
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    // Bad / expired token: defer to authenticate so the 401 path with the
    // proper error code (TOKEN_EXPIRED, etc) wins. Don't shadow it here.
    return next();
  }

  // Token signed before #399 may lack organizationId. Without that field
  // we can't perform the match, so let authenticate (which loads the
  // user from the DB) be the load-bearing check.
  if (!payload.organizationId) return next();

  if (payload.organizationId !== req.tenant.org_id) {
    logger.warn("[VerifyTenantUserMatch] User/tenant mismatch:", {
      userId: payload.id,
      userOrg: payload.organizationId,
      tenantOrg: req.tenant.org_id,
    });
    return res.status(403).json({
      error: "You do not have access to this organization's data.",
      code: "TENANT_ACCESS_DENIED",
    });
  }

  next();
};
