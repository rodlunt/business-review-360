// Plan Limits Middleware
// Issue #340: Enforce plan limits server side
//
// Enforces tenant plan limits (maxIdeas, maxUsers, maxStorage)
// Reads limits from platform.tenants.limits JSONB column

import { sequelize } from "../models/database.js";
import { QueryTypes } from "sequelize";
import { logger, createLogger } from "../utils/logger.js";

// Issue #865: Plans permitted to use the bulk staff-list import.
// Comma-separated env, defaults to enterprise only ("top tier"). Lower-cased.
const BULK_INVITE_ALLOWED_PLANS = (process.env.BULK_INVITE_ALLOWED_PLANS || "enterprise")
  .toLowerCase()
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/**
 * Issue #865: Gate the bulk staff-list import route by subscription plan.
 *
 * Independent of the per-org volume caps in `middleware/bulkImportCaps.js`;
 * this is the *packaging* layer (which plans expose the feature at all),
 * the caps are the *safety* layer (the load-bearing protection for the
 * shared Resend quota - see #735).
 */
export function requireBulkInvitePlan(req, res, next) {
  const log = createLogger(req);
  if (!req.tenant) {
    log.warn("[PlanLimits] No tenant context for requireBulkInvitePlan");
    return res.status(403).json({ error: "Tenant context required", code: "TENANT_REQUIRED" });
  }
  const plan = (req.tenant.plan || "").toLowerCase();
  if (!BULK_INVITE_ALLOWED_PLANS.includes(plan)) {
    log.info(
      `[PlanLimits] Bulk invite blocked for tenant ${req.tenant.org_id} on plan "${req.tenant.plan}"`
    );
    return res.status(403).json({
      error: "Bulk staff import is not available on your current plan",
      code: "PLAN_FEATURE_NOT_AVAILABLE",
      feature: "bulk-staff-import",
      plan: req.tenant.plan,
      allowedPlans: BULK_INVITE_ALLOWED_PLANS,
      upgradeUrl: `/org/${req.tenant.org_id}/billing/upgrade`,
    });
  }
  next();
}

/**
 * Check if tenant has reached their plan limit for a specific resource
 *
 * @param {string} limitType - Type of limit to check (maxIdeas, maxUsers, maxStorage)
 * @returns {Function} Express middleware
 */
export function checkPlanLimit(limitType) {
  return async (req, res, next) => {
    const log = createLogger(req);
    try {
      // Skip if no tenant context
      if (!req.tenant) {
        log.warn(`[PlanLimits] No tenant context for limit check: ${limitType}`);
        return next();
      }

      const limits = req.tenant.limits;

      // Check specific limit type
      switch (limitType) {
        case "maxIdeas":
          await checkIdeaLimit(req, res, next, limits);
          break;

        case "maxUsers":
          await checkUserLimit(req, res, next, limits);
          break;

        case "maxStorage":
          await checkStorageLimit(req, res, next, limits);
          break;

        default:
          log.warn(`[PlanLimits] Unknown limit type: ${limitType}`);
          return next();
      }
    } catch (error) {
      log.error(`[PlanLimits] Error checking ${limitType} limit:`, error);
      // Don't block request on limit check error
      return next();
    }
  };
}

/**
 * Check if tenant can create more ideas
 */
async function checkIdeaLimit(req, res, next, limits) {
  const log = createLogger(req);
  const maxIdeas = limits.maxIdeas;

  // -1 means unlimited
  if (maxIdeas === -1) {
    return next();
  }

  // Count current ideas for this tenant, excluding demo data (#527)
  const result = await sequelize.query(
    'SELECT COUNT(*) as count FROM "Ideas" WHERE tenant_id = :tenantId AND "isDemoData" = false',
    {
      replacements: { tenantId: req.tenant.id },
      type: QueryTypes.SELECT,
    }
  );

  const currentCount = parseInt(result[0].count);

  if (currentCount >= maxIdeas) {
    log.info(
      `[PlanLimits] Idea limit reached for tenant ${req.tenant.org_id}: ${currentCount}/${maxIdeas}`
    );
    return res.status(403).json({
      error: "You have reached your plan's idea limit",
      code: "PLAN_LIMIT_REACHED",
      limitType: "ideas",
      current: currentCount,
      max: maxIdeas,
      plan: req.tenant.plan,
      upgradeUrl: `/org/${req.tenant.org_id}/billing/upgrade`,
    });
  }

  log.info(`[PlanLimits] Idea limit check passed: ${currentCount}/${maxIdeas}`);
  next();
}

/**
 * Check if tenant can create more users
 */
async function checkUserLimit(req, res, next, limits) {
  const log = createLogger(req);
  const maxUsers = limits.maxUsers;

  // -1 means unlimited
  if (maxUsers === -1) {
    return next();
  }

  // Count current users for this tenant
  const result = await sequelize.query(
    'SELECT COUNT(*) as count FROM "Users" WHERE tenant_id = :tenantId',
    {
      replacements: { tenantId: req.tenant.id },
      type: QueryTypes.SELECT,
    }
  );

  const currentCount = parseInt(result[0].count);

  if (currentCount >= maxUsers) {
    log.info(
      `[PlanLimits] User limit reached for tenant ${req.tenant.org_id}: ${currentCount}/${maxUsers}`
    );
    return res.status(403).json({
      error: "You have reached your plan's user limit",
      code: "PLAN_LIMIT_REACHED",
      limitType: "users",
      current: currentCount,
      max: maxUsers,
      plan: req.tenant.plan,
      upgradeUrl: `/org/${req.tenant.org_id}/billing/upgrade`,
    });
  }

  log.info(`[PlanLimits] User limit check passed: ${currentCount}/${maxUsers}`);
  next();
}

/**
 * Check if tenant has storage space available
 * Currently not enforced (future feature for file uploads)
 */
async function checkStorageLimit(req, res, next, limits) {
  const log = createLogger(req);
  const maxStorage = limits.maxStorage;

  // -1 means unlimited
  if (maxStorage === -1) {
    return next();
  }

  // TODO: Implement storage calculation when file uploads are added
  // For now, just pass through
  log.info(`[PlanLimits] Storage limit check skipped (not implemented yet)`);
  next();
}

/**
 * Get current usage for a tenant
 * Useful for displaying usage stats in UI
 */
export async function getTenantUsage(tenantId) {
  try {
    const [ideas, users] = await Promise.all([
      sequelize.query(
        'SELECT COUNT(*) as count FROM "Ideas" WHERE tenant_id = :tenantId AND "isDemoData" = false',
        {
          replacements: { tenantId },
          type: QueryTypes.SELECT,
        }
      ),
      sequelize.query('SELECT COUNT(*) as count FROM "Users" WHERE tenant_id = :tenantId', {
        replacements: { tenantId },
        type: QueryTypes.SELECT,
      }),
    ]);

    return {
      ideas: parseInt(ideas[0].count),
      users: parseInt(users[0].count),
      storage: 0, // TODO: Calculate when file uploads added
    };
  } catch (error) {
    logger.error("[PlanLimits] Error getting tenant usage:", error);
    return { ideas: 0, users: 0, storage: 0 };
  }
}

/**
 * Middleware to attach usage stats to request
 * Useful for routes that need to show usage information
 */
export async function attachUsageStats(req, res, next) {
  if (!req.tenant) {
    return next();
  }

  const log = createLogger(req);
  try {
    req.usage = await getTenantUsage(req.tenant.id);
    next();
  } catch (error) {
    log.error("[PlanLimits] Error attaching usage stats:", error);
    // Don't block request, just skip usage stats
    next();
  }
}
