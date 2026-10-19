// Tenant Resolver Middleware
// Issue: #330 - Backend tenant resolver and Sequelize context
// Issue: #331 - Reserved organizationId validation
// Issue: #459 - Standardized naming from orgId to organizationId
// Issue: #561 - Removed session-level set_tenant_context call; RLS context
//   is now set transaction-locally by wrapTenantTransaction (which runs
//   immediately after this middleware on /api).
// Issue: #751 - Removed the dead user/tenant match check that referenced
//   req.user before authenticate had run. The check moved into
//   authenticate (auth.js) where req.user and req.tenant first coexist.
//
// Resolves the tenant for the request and attaches the tenant object to
// req. The cross-tenant access guard now lives in authenticate. The
// PostgreSQL RLS context (`app.tenant_id`) is set transaction-locally by
// wrapTenantTransaction, not here.

import { platformSequelize } from "../models/platformDatabase.js";
import { QueryTypes } from "sequelize";
import { validateOrganizationId, isReservedOrganizationId } from "../utils/orgIdValidation.js";
import { logger } from "../utils/logger.js";

// In-memory cache for tenant lookups (TTL: 5 minutes)
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get tenant from platform database with caching.
 *
 * Exported (#744) so non-request code paths (cron workers, services) can
 * resolve a tenant UUID from an organizationId slug before wrapping their
 * work in withTenantContext. The cache TTL (5 min) and clearTenantCache()
 * affordance apply uniformly to request and worker callers.
 *
 * @param {string} organizationId - Organization ID (e.g., "tradezone")
 * @returns {Promise<Object|null>} Tenant object or null
 */
export async function getTenantByOrganizationId(organizationId) {
  // Issue #587: a falsy organizationId reaching Sequelize as a named
  // replacement throws and surfaces as a 500 in the login route, which
  // distinguishes "no org provided" from "bad creds" and leaks an
  // enumeration channel. Treat falsy as a cache-miss-equivalent null.
  if (!organizationId) return null;

  // Check cache first
  const cached = tenantCache.get(organizationId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info(`[TenantResolver] Cache hit for org: ${organizationId}`);
    return cached.data;
  }

  // Query platform database
  logger.info(`[TenantResolver] Querying platform DB for org: ${organizationId}`);
  try {
    const tenants = await platformSequelize.query(
      "SELECT id, org_id, tenant_name, plan, status, limits, trial_ends_at FROM tenants WHERE org_id = :organizationId",
      {
        replacements: { organizationId },
        type: QueryTypes.SELECT,
      }
    );

    const tenant = tenants.length > 0 ? tenants[0] : null;

    // Cache the result (even if null)
    tenantCache.set(organizationId, {
      data: tenant,
      timestamp: Date.now(),
    });

    return tenant;
  } catch (error) {
    logger.error(`[TenantResolver] Error querying platform DB for org ${organizationId}:`, error);
    throw error;
  }
}

/**
 * Extract organization ID from request path or query
 * Supports:
 * - Path: /org/:organizationId/...
 * - Query: ?organizationId=...
 * - Body: { organizationId: "..." }
 * - User: req.user.organizationId (fallback)
 *
 * @param {Object} req - Express request object
 * @returns {string|null} Organization ID or null
 */
function extractOrganizationId(req) {
  // 0. Check Host header for subdomain-based tenancy (#517)
  // e.g., demo-corp.br360.example.com → "demo-corp"
  const host = (req.headers.host || "").split(":")[0];
  const baseDomain = process.env.BASE_DOMAIN || "br360.example.com";
  if (host.endsWith("." + baseDomain)) {
    const sub = host.slice(0, -(baseDomain.length + 1));
    // Accept single-segment subdomains only; reject reserved names (api, www, etc.)
    if (sub && !sub.includes(".") && !isReservedOrganizationId(sub)) {
      logger.info(`[TenantResolver] organizationId from Host header: ${sub}`);
      return sub;
    }
  }

  // 1. Check path params (e.g., /org/tradezone/ideas)
  if (req.params && req.params.organizationId) {
    logger.info(`[TenantResolver] organizationId from path params: ${req.params.organizationId}`);
    return req.params.organizationId;
  }

  // 2. Check query string (e.g., ?organizationId=tradezone)
  if (req.query && req.query.organizationId) {
    logger.info(`[TenantResolver] organizationId from query: ${req.query.organizationId}`);
    return req.query.organizationId;
  }

  // 3. Check request body (e.g., POST { organizationId: "tradezone" })
  if (req.body && req.body.organizationId) {
    logger.info(`[TenantResolver] organizationId from body: ${req.body.organizationId}`);
    return req.body.organizationId;
  }

  // 4. Fallback to authenticated user's organization
  if (req.user && req.user.organizationId) {
    logger.info(`[TenantResolver] organizationId from req.user: ${req.user.organizationId}`);
    return req.user.organizationId;
  }

  logger.warn("[TenantResolver] No organizationId found in request");
  return null;
}

/**
 * Tenant Resolver Middleware
 *
 * - Extracts organization ID from request
 * - Looks up tenant in platform database
 * - Verifies tenant is active
 * - Attaches tenant to req.tenant
 *
 * The PostgreSQL RLS context (`app.tenant_id`) is NOT set here. That is
 * the responsibility of wrapTenantTransaction, which runs immediately
 * after this middleware on /api and sets `SET LOCAL app.tenant_id` inside
 * a request-scoped transaction (#561).
 *
 * The user/tenant match check (defence-in-depth layer 1) lives in
 * authenticate (#751), since authenticate is mounted per-route and
 * runs after this middleware -- req.user is undefined here.
 *
 * MUST be used BEFORE wrapTenantTransaction
 */
export const resolveTenant = async (req, res, next) => {
  try {
    logger.info(`[TenantResolver] Processing request: ${req.method} ${req.path}`);

    // Extract organization ID from request
    const organizationId = extractOrganizationId(req);

    if (!organizationId) {
      // No organizationId found - this might be OK for some routes (e.g., /health, /login)
      // Let the route decide if it needs tenant context
      logger.info("[TenantResolver] No organizationId found, skipping tenant resolution");
      return next();
    }

    // Validate organizationId format (#331)
    const validation = validateOrganizationId(organizationId);
    if (!validation.valid) {
      logger.warn(
        `[TenantResolver] Invalid organizationId format: ${organizationId} - ${validation.error}`
      );
      return res.status(400).json({
        error: validation.error,
        code: "INVALID_ORG_ID",
        field: "organizationId",
        provided: organizationId,
      });
    }

    // Use sanitized (lowercased) version
    const sanitizedOrganizationId = validation.sanitized;

    // Look up tenant in platform database
    const tenant = await getTenantByOrganizationId(sanitizedOrganizationId);

    if (!tenant) {
      logger.warn(`[TenantResolver] Tenant not found for org: ${sanitizedOrganizationId}`);
      return res.status(404).json({
        error: "Organization not found",
        code: "TENANT_NOT_FOUND",
      });
    }

    // Check tenant status
    const allowedStatuses = ["active", "trial", "trial_expired"];
    if (!allowedStatuses.includes(tenant.status)) {
      logger.warn(
        `[TenantResolver] Tenant not active for org: ${sanitizedOrganizationId}, status: ${tenant.status}`
      );
      return res.status(403).json({
        error: "This organisation is not active. Please contact support.",
        code: "TENANT_NOT_ACTIVE",
        status: tenant.status,
      });
    }

    // Attach trial metadata for downstream middleware to consume.
    if (tenant.status === "trial" || tenant.status === "trial_expired") {
      tenant.trialEndsAt = tenant.trial_ends_at;
      tenant.trialExpired = tenant.status === "trial_expired";
    }

    // Attach tenant info to request. wrapTenantTransaction will read
    // req.tenant.id and SET LOCAL app.tenant_id inside its transaction.
    // The user/tenant match check moved into authenticate (#751).
    req.tenant = tenant;
    logger.info(`[TenantResolver] Tenant resolved: ${tenant.tenant_name} (${tenant.id})`);

    next();
  } catch (error) {
    logger.error("[TenantResolver] Error resolving tenant:", error);
    return res.status(500).json({
      error: "Failed to resolve tenant",
      code: "TENANT_RESOLUTION_ERROR",
    });
  }
};

/**
 * Middleware to require tenant context
 * Use this on routes that MUST have a tenant (most data routes)
 */
export const requireTenant = (req, res, next) => {
  if (!req.tenant) {
    logger.warn("[TenantResolver] requireTenant: No tenant in request");
    return res.status(400).json({
      error: "Organization context required",
      code: "TENANT_REQUIRED",
    });
  }
  next();
};

/**
 * Get tenant ID by organization ID (helper for login)
 * @param {string} organizationId - Organization ID
 * @returns {Promise<string|null>} Tenant UUID or null
 */
export async function getTenantId(organizationId) {
  const tenant = await getTenantByOrganizationId(organizationId);
  return tenant ? tenant.id : null;
}

/**
 * Clear tenant cache (useful for testing or after tenant updates)
 */
export function clearTenantCacheEntry(organizationId) {
  if (tenantCache.has(organizationId)) {
    tenantCache.delete(organizationId);
    logger.info(`[TenantResolver] Cache entry cleared for org: ${organizationId}`);
  }
}

export function clearTenantCache() {
  const size = tenantCache.size;
  tenantCache.clear();
  logger.info(`[TenantResolver] Cache cleared (${size} entries removed)`);
}

/**
 * Get tenant cache stats (for monitoring/debugging)
 */
export function getTenantCacheStats() {
  return {
    size: tenantCache.size,
    entries: Array.from(tenantCache.entries()).map(([organizationId, value]) => ({
      organizationId,
      age: Date.now() - value.timestamp,
      tenantName: value.data?.tenant_name || "null",
    })),
  };
}
