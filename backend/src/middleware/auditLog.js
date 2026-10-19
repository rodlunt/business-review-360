/**
 * Audit Logging Middleware
 * Issues #338, #127: Support mode and security compliance audit logging
 *
 * Logs sensitive operations for security compliance and audit trails:
 * - User authentication (login, logout, password changes)
 * - Admin operations (user management, settings changes)
 * - Support mode access (when enabled)
 * - Data access (tenant data queries)
 * - Configuration changes
 */

import { platformSequelize } from "../models/platformDatabase.js";
import { QueryTypes } from "sequelize";
import { createLogger } from "../utils/logger.js";

/**
 * Audit log entry structure
 * Stored in platform database for cross-tenant visibility
 */
export class AuditLog {
  /**
   * Create an audit log entry
   * @param {Object} params - Audit log parameters
   * @param {string} params.action - Action performed (e.g., 'login', 'user.create', 'settings.update')
   * @param {string} params.actor_id - User ID who performed the action
   * @param {string} params.actor_email - Email of the actor
   * @param {string} params.actor_role - Role of the actor (user, admin, support)
   * @param {string} params.tenant_id - Tenant ID (if applicable)
   * @param {string} params.resource_type - Type of resource affected (user, idea, settings, etc.)
   * @param {string} params.resource_id - ID of the resource affected
   * @param {Object} params.changes - Changes made (before/after values)
   * @param {Object} params.metadata - Additional context (IP, user agent, etc.)
   * @param {string} params.status - Status (success, failure, denied)
   * @param {string} params.request_id - X-Request-ID for correlation
   */
  static async create({
    action,
    actor_id,
    actor_email,
    actor_role = "user",
    tenant_id = null,
    resource_type = null,
    resource_id = null,
    changes = null,
    metadata = {},
    status = "success",
    request_id = null,
  }) {
    const logger = createLogger();

    try {
      await platformSequelize.query(
        `INSERT INTO audit_logs (
          action, actor_id, actor_email, actor_role, tenant_id,
          resource_type, resource_id, changes, metadata, status, request_id
        ) VALUES (
          :action, :actor_id, :actor_email, :actor_role, :tenant_id,
          :resource_type, :resource_id, :changes::jsonb, :metadata::jsonb, :status, :request_id
        )`,
        {
          replacements: {
            action,
            actor_id: actor_id || null,
            actor_email: actor_email || "anonymous",
            actor_role,
            tenant_id,
            resource_type,
            resource_id,
            changes: changes ? JSON.stringify(changes) : null,
            metadata: JSON.stringify(metadata),
            status,
            request_id,
          },
          type: QueryTypes.INSERT,
        }
      );

      logger.debug("Audit log entry created", {
        action,
        actor_id,
        tenant_id,
        resource_type,
        status,
      });
    } catch (error) {
      // Never fail the main operation due to audit log failure
      logger.error("Failed to create audit log entry", error);
    }
  }

  /**
   * Query audit logs (admin only)
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Array>} Audit log entries
   */
  static async query({
    tenant_id = null,
    actor_id = null,
    action = null,
    resource_type = null,
    start_date = null,
    end_date = null,
    limit = 100,
    offset = 0,
  } = {}) {
    let whereConditions = [];
    let replacements = { limit, offset };

    if (tenant_id) {
      whereConditions.push("tenant_id = :tenant_id");
      replacements.tenant_id = tenant_id;
    }
    if (actor_id) {
      whereConditions.push("actor_id = :actor_id");
      replacements.actor_id = actor_id;
    }
    if (action) {
      whereConditions.push("action = :action");
      replacements.action = action;
    }
    if (resource_type) {
      whereConditions.push("resource_type = :resource_type");
      replacements.resource_type = resource_type;
    }
    if (start_date) {
      whereConditions.push("created_at >= :start_date");
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereConditions.push("created_at <= :end_date");
      replacements.end_date = end_date;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const [results] = await platformSequelize.query(
      `SELECT * FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: QueryTypes.SELECT,
      }
    );

    return results;
  }
}

/**
 * Sensitive field names that must be redacted before any object is
 * persisted via logAuditEvent({changes: ...}). The middleware-based
 * auditLogger redacts these from request bodies; this helper covers
 * the manual-call path (logAuditEvent inside route handlers).
 */
const SENSITIVE_FIELDS = [
  "password",
  "password_hash",
  "passwordHash",
  "adminPassword",
  "token",
  "refresh_token",
  "refreshToken",
  "secret",
  "api_key",
  "apiKey",
];

/**
 * Recursively strip sensitive fields from an object, replacing their
 * values with the literal string '[REDACTED]'. Returns a new object;
 * does not mutate the input. Idempotent: calling twice is safe.
 *
 * Use before passing any Sequelize row's .toJSON() output into an
 * audit_logs row's `changes` field. Deny-list (not allow-list) by
 * design; new sensitive fields go in SENSITIVE_FIELDS above.
 */
export function redactForAudit(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactForAudit);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.includes(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactForAudit(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Audit logging middleware
 * Automatically logs auditable actions based on route and method
 */
export function auditLogger(options = {}) {
  const {
    action = null,
    resourceType = null,
    captureBody = false,
    captureQuery = false,
    requireAuth = true,
  } = options;

  return async (req, res, next) => {
    const logger = createLogger(req);

    // Skip if audit logging is disabled
    if (process.env.ENABLE_AUDIT_LOGGING === "false") {
      return next();
    }

    // Skip if user is not authenticated and auth is required
    if (requireAuth && !req.user) {
      return next();
    }

    // Capture original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Determine action name from route or parameter
      const actionName = action || `${req.method.toLowerCase()}.${resourceType || "resource"}`;

      // Extract resource ID from params or body
      const resourceId = req.params?.id || body?.id || null;

      // Build metadata
      const metadata = {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      };

      if (captureQuery && Object.keys(req.query).length > 0) {
        metadata.query = req.query;
      }

      if (captureBody && req.body) {
        metadata.body = redactForAudit(req.body);
      }

      // Determine status
      const status = res.statusCode < 400 ? "success" : "failure";

      // Create audit log entry (async, don't block response)
      AuditLog.create({
        action: actionName,
        actor_id: req.user?.id || null,
        actor_email: req.user?.email || "anonymous",
        actor_role: req.user?.isAdmin ? "admin" : req.user?.supportMode ? "support" : "user",
        tenant_id: req.tenant?.id || null,
        resource_type: resourceType,
        resource_id: resourceId,
        changes: null, // Can be populated by route handler
        metadata,
        status,
        request_id: req.id,
      }).catch((error) => {
        logger.error("Audit log middleware error", error);
      });

      // Continue with original response
      return originalJson(body);
    };

    next();
  };
}

/**
 * Helper function to manually log audit events from route handlers
 * Use this for complex operations where automatic logging isn't sufficient
 */
export async function logAuditEvent(
  req,
  {
    action,
    resourceType,
    resourceId = null,
    changes = null,
    status = "success",
    metadata: callerMetadata = {},
  }
) {
  const metadata = {
    ...callerMetadata,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    method: req.method,
    path: req.path,
  };

  await AuditLog.create({
    action,
    actor_id: req.user?.id || null,
    actor_email: req.user?.email || "anonymous",
    actor_role: req.user?.isAdmin ? "admin" : req.user?.supportMode ? "support" : "user",
    tenant_id: req.tenant?.id || null,
    resource_type: resourceType,
    resource_id: resourceId,
    changes,
    metadata,
    status,
    request_id: req.id,
  });
}

/**
 * Support mode middleware
 * Enables read-only support access with audit logging
 * Issue #338: Support mode and audit
 */
export function supportMode(req, res, next) {
  const logger = createLogger(req);

  // Check if support mode is enabled globally
  const supportModeEnabled = process.env.ENABLE_SUPPORT_MODE === "true";

  if (!supportModeEnabled) {
    return next();
  }

  // Check if user has support role
  const isSupportUser = req.user?.role === "support" || req.user?.email?.includes("@support.");

  if (isSupportUser) {
    // Mark request as support mode
    req.supportMode = true;
    req.user.supportMode = true;

    // Log support access
    logger.info("Support mode access", {
      supportUser: req.user.email,
      tenant: req.tenant?.subdomain,
      path: req.path,
    });

    // Audit log support access
    AuditLog.create({
      action: "support.access",
      actor_id: req.user.id,
      actor_email: req.user.email,
      actor_role: "support",
      tenant_id: req.tenant?.id,
      resource_type: "tenant_data",
      metadata: {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        path: req.path,
        method: req.method,
      },
      status: "success",
      request_id: req.id,
    }).catch((error) => {
      logger.error("Failed to log support access", error);
    });

    // Restrict write operations in support mode
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      logger.warn("Support mode attempted write operation", {
        supportUser: req.user.email,
        method: req.method,
        path: req.path,
      });

      return res.status(403).json({
        error: "Support mode is read-only. Write operations are not permitted.",
        code: "SUPPORT_MODE_READ_ONLY",
      });
    }
  }

  next();
}

/**
 * Audit-specific routes for viewing logs (admin only)
 */
export function createAuditRoutes(router) {
  const { authenticate } = require("./auth.js");

  /**
   * GET /api/audit/logs
   * Retrieve audit logs (admin only)
   */
  router.get("/logs", authenticate, async (req, res) => {
    const logger = createLogger(req);

    // Only admins can view audit logs
    if (!req.user?.isAdmin) {
      logger.warn("Non-admin attempted to view audit logs", {
        userId: req.user?.id,
        email: req.user?.email,
      });

      return res.status(403).json({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
      });
    }

    try {
      const {
        tenant_id,
        actor_id,
        action,
        resource_type,
        start_date,
        end_date,
        limit = 100,
        offset = 0,
      } = req.query;

      const logs = await AuditLog.query({
        tenant_id,
        actor_id,
        action,
        resource_type,
        start_date,
        end_date,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      // Log audit log access
      await logAuditEvent(req, {
        action: "audit.logs.view",
        resourceType: "audit_logs",
        status: "success",
      });

      res.json({
        logs,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          returned: logs.length,
        },
      });
    } catch (error) {
      logger.error("Failed to retrieve audit logs", error);
      res.status(500).json({
        error: "Failed to retrieve audit logs",
        code: "AUDIT_LOG_ERROR",
      });
    }
  });

  /**
   * GET /api/audit/stats
   * Audit log statistics (admin only)
   */
  router.get("/stats", authenticate, async (req, res) => {
    const logger = createLogger(req);

    if (!req.user?.isAdmin) {
      return res.status(403).json({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
      });
    }

    try {
      const { tenant_id, days = 30 } = req.query;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      let whereClause = "WHERE created_at >= :start_date";
      const replacements = { start_date: startDate.toISOString() };

      if (tenant_id) {
        whereClause += " AND tenant_id = :tenant_id";
        replacements.tenant_id = tenant_id;
      }

      const [stats] = await platformSequelize.query(
        `SELECT
          COUNT(*) as total_logs,
          COUNT(DISTINCT actor_id) as unique_actors,
          COUNT(CASE WHEN status = 'failure' THEN 1 END) as failed_operations,
          COUNT(CASE WHEN actor_role = 'support' THEN 1 END) as support_accesses,
          COUNT(CASE WHEN action LIKE 'auth.%' THEN 1 END) as auth_events
         FROM audit_logs
         ${whereClause}`,
        {
          replacements,
          type: QueryTypes.SELECT,
        }
      );

      res.json({
        period_days: parseInt(days),
        stats: stats[0] || {},
      });
    } catch (error) {
      logger.error("Failed to retrieve audit stats", error);
      res.status(500).json({
        error: "Failed to retrieve audit statistics",
        code: "AUDIT_STATS_ERROR",
      });
    }
  });

  return router;
}

export default {
  AuditLog,
  auditLogger,
  logAuditEvent,
  redactForAudit,
  supportMode,
  createAuditRoutes,
};
