/**
 * Audit Log Routes
 * Issues #338, #127: Support mode and security compliance audit logging
 *
 * Provides endpoints for viewing and querying audit logs (admin only)
 */

import express from "express";
import { AuditLog, auditLogger } from "../middleware/auditLog.js";
import { createLogger } from "../utils/logger.js";

const router = express.Router();

/**
 * GET /api/audit/logs
 * Retrieve audit logs (admin only)
 */
router.get(
  "/logs",
  auditLogger({ action: "audit.logs.view", resourceType: "audit_logs" }),
  async (req, res) => {
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

      logger.info("Audit logs retrieved", {
        filters: { tenant_id, actor_id, action, resource_type },
        count: logs.length,
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
        requestId: req.id,
      });
    }
  }
);

/**
 * GET /api/audit/stats
 * Audit log statistics (admin only)
 */
router.get(
  "/stats",
  auditLogger({ action: "audit.stats.view", resourceType: "audit_logs" }),
  async (req, res) => {
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

      let whereClause = "WHERE created_at >= $1";
      const values = [startDate.toISOString()];

      if (tenant_id) {
        whereClause += " AND tenant_id = $2";
        values.push(tenant_id);
      }

      const { platformSequelize } = await import("../models/platformDatabase.js");
      const { QueryTypes } = await import("sequelize");

      const [result] = await platformSequelize.query(
        `SELECT
        COUNT(*) as total_logs,
        COUNT(DISTINCT actor_id) as unique_actors,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as failed_operations,
        COUNT(CASE WHEN actor_role = 'support' THEN 1 END) as support_accesses,
        COUNT(CASE WHEN action LIKE 'auth.%' THEN 1 END) as auth_events
       FROM audit_logs
       ${whereClause}`,
        {
          bind: values,
          type: QueryTypes.SELECT,
        }
      );

      logger.info("Audit stats retrieved", {
        period_days: parseInt(days),
        tenant_id,
      });

      res.json({
        period_days: parseInt(days),
        stats: result || {},
      });
    } catch (error) {
      logger.error("Failed to retrieve audit stats", error);
      res.status(500).json({
        error: "Failed to retrieve audit statistics",
        code: "AUDIT_STATS_ERROR",
        requestId: req.id,
      });
    }
  }
);

/**
 * GET /api/audit/actions
 * Get list of available audit action types (admin only)
 * Useful for filtering in UI
 */
router.get(
  "/actions",
  auditLogger({ action: "audit.actions.list", resourceType: "audit_logs" }),
  async (req, res) => {
    const logger = createLogger(req);

    if (!req.user?.isAdmin) {
      return res.status(403).json({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
      });
    }

    try {
      const { platformSequelize } = await import("../models/platformDatabase.js");
      const { QueryTypes } = await import("sequelize");

      const actions = await platformSequelize.query(
        `SELECT DISTINCT action
       FROM audit_logs
       ORDER BY action ASC
       LIMIT 100`,
        {
          type: QueryTypes.SELECT,
        }
      );

      res.json({
        actions: actions.map((row) => row.action),
      });
    } catch (error) {
      logger.error("Failed to retrieve audit actions", error);
      res.status(500).json({
        error: "Failed to retrieve audit actions",
        code: "AUDIT_ACTIONS_ERROR",
        requestId: req.id,
      });
    }
  }
);

export default router;
