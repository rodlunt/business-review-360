/**
 * Email Queue Routes
 *
 * Admin API endpoints for managing the email queue.
 *
 * Issue #446: Email queue and scheduling system
 */

import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { auditLogger } from "../middleware/auditLog.js";
import EmailQueue from "../models/EmailQueue.js";
import EmailLog from "../models/EmailLog.js";
import {
  getQueueStats,
  getEmailStats,
  retryEmail,
  cancelEmail,
  processQueue,
  monitorQueueHealth,
  getRateLimitStatus,
} from "../services/emailQueueService.js";
import { Op } from "sequelize";
import { logger } from "../utils/logger.js";

const router = express.Router();

/**
 * GET /api/admin/email-queue
 * Get queued emails with pagination and filters
 */
router.get(
  "/",
  auditLogger({ action: "email-queue.list", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, status, type, priority } = req.query;

      const offset = (page - 1) * limit;
      const where = { organizationId: req.user.organizationId };

      if (status) where.status = status;
      if (type) where.type = type;
      if (priority) where.priority = parseInt(priority, 10);

      const { count, rows } = await EmailQueue.findAndCountAll({
        where,
        order: [
          ["priority", "ASC"],
          ["scheduledFor", "ASC"],
        ],
        limit: parseInt(limit, 10),
        offset,
      });

      res.json({
        emails: rows,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      logger.error("[EmailQueue] Get queue error:", error);
      res.status(500).json({ error: "Failed to get email queue" });
    }
  }
);

/**
 * GET /api/admin/email-queue/stats
 * Get queue statistics
 */
router.get(
  "/stats",
  auditLogger({ action: "email-queue.stats.view", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const stats = await getQueueStats(req.user.organizationId);
      res.json(stats);
    } catch (error) {
      logger.error("[EmailQueue] Stats error:", error);
      res.status(500).json({ error: "Failed to get queue stats" });
    }
  }
);

/**
 * GET /api/admin/email-queue/health
 * Get queue health status
 */
router.get(
  "/health",
  auditLogger({ action: "email-queue.health.view", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const health = await monitorQueueHealth();
      res.json(health);
    } catch (error) {
      logger.error("[EmailQueue] Health check error:", error);
      res.status(500).json({ error: "Failed to check queue health" });
    }
  }
);

/**
 * GET /api/admin/email-queue/rate-limit
 * Get current rate limit status
 */
router.get(
  "/rate-limit",
  auditLogger({ action: "email-queue.rate-limit.view", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const status = getRateLimitStatus();
      res.json(status);
    } catch (error) {
      logger.error("[EmailQueue] Rate limit error:", error);
      res.status(500).json({ error: "Failed to get rate limit status" });
    }
  }
);

/**
 * POST /api/admin/email-queue/process
 * Manually trigger queue processing (useful for testing)
 */
router.post(
  "/process",
  auditLogger({ action: "email-queue.process", resourceType: "email_queue", captureBody: true }),
  requireAdmin,
  async (req, res) => {
    try {
      const { batchSize = 10 } = req.body;
      const result = await processQueue(parseInt(batchSize, 10));
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error("[EmailQueue] Process error:", error);
      res.status(500).json({ error: "Failed to process queue" });
    }
  }
);

/**
 * POST /api/admin/email-queue/:id/retry
 * Retry a failed email
 */
router.post(
  "/:id/retry",
  auditLogger({ action: "email-queue.entry.retry", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const email = await retryEmail(req.params.id);
      res.json({
        success: true,
        email,
      });
    } catch (error) {
      logger.error("[EmailQueue] Retry error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * POST /api/admin/email-queue/:id/cancel
 * Cancel a pending email
 */
router.post(
  "/:id/cancel",
  auditLogger({ action: "email-queue.entry.cancel", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const email = await cancelEmail(req.params.id);
      res.json({
        success: true,
        email,
      });
    } catch (error) {
      logger.error("[EmailQueue] Cancel error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * DELETE /api/admin/email-queue/:id
 * Delete a queue entry (only for cancelled/failed)
 */
router.delete(
  "/:id",
  auditLogger({ action: "email-queue.entry.delete", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const email = await EmailQueue.findByPk(req.params.id);
      if (!email) {
        return res.status(404).json({ error: "Email not found" });
      }

      if (!["cancelled", "failed"].includes(email.status)) {
        return res.status(400).json({ error: "Can only delete cancelled or failed emails" });
      }

      await email.destroy();
      res.json({ success: true });
    } catch (error) {
      logger.error("[EmailQueue] Delete error:", error);
      res.status(500).json({ error: "Failed to delete email" });
    }
  }
);

/**
 * GET /api/admin/email-logs
 * Get email delivery logs
 */
router.get(
  "/logs",
  auditLogger({ action: "email-queue.logs.view", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status, type, startDate, endDate } = req.query;

      const offset = (page - 1) * limit;
      const where = { organizationId: req.user.organizationId };

      if (status) where.status = status;
      if (type) where.type = type;
      if (startDate || endDate) {
        where.sentAt = {};
        if (startDate) where.sentAt[Op.gte] = new Date(startDate);
        if (endDate) where.sentAt[Op.lte] = new Date(endDate);
      }

      const { count, rows } = await EmailLog.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit: parseInt(limit, 10),
        offset,
      });

      res.json({
        logs: rows,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      logger.error("[EmailQueue] Get logs error:", error);
      res.status(500).json({ error: "Failed to get email logs" });
    }
  }
);

/**
 * GET /api/admin/email-logs/stats
 * Get email delivery statistics
 */
router.get(
  "/logs/stats",
  auditLogger({ action: "email-queue.logs.stats.view", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { startDate, endDate, type } = req.query;

      const stats = await getEmailStats({
        organizationId: req.user.organizationId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        type,
      });

      res.json(stats);
    } catch (error) {
      logger.error("[EmailQueue] Log stats error:", error);
      res.status(500).json({ error: "Failed to get email stats" });
    }
  }
);

/**
 * GET /api/admin/email-logs/by-type
 * Get email statistics grouped by type
 */
router.get(
  "/logs/by-type",
  auditLogger({ action: "email-queue.logs.by-type.view", resourceType: "email_queue" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const where = { organizationId: req.user.organizationId };
      if (startDate || endDate) {
        where.sentAt = {};
        if (startDate) where.sentAt[Op.gte] = new Date(startDate);
        if (endDate) where.sentAt[Op.lte] = new Date(endDate);
      }

      const byType = await EmailLog.findAll({
        where,
        attributes: [
          "type",
          [EmailLog.sequelize.fn("COUNT", "*"), "total"],
          [
            EmailLog.sequelize.fn(
              "SUM",
              EmailLog.sequelize.literal(
                "CASE WHEN status = 'sent' OR status = 'delivered' THEN 1 ELSE 0 END"
              )
            ),
            "successful",
          ],
          [
            EmailLog.sequelize.fn(
              "SUM",
              EmailLog.sequelize.literal(
                "CASE WHEN status = 'failed' OR status = 'bounced' THEN 1 ELSE 0 END"
              )
            ),
            "failed",
          ],
          [
            EmailLog.sequelize.fn(
              "SUM",
              EmailLog.sequelize.literal("CASE WHEN status = 'opened' THEN 1 ELSE 0 END")
            ),
            "opened",
          ],
        ],
        group: ["type"],
        raw: true,
      });

      res.json(
        byType.map((row) => ({
          type: row.type,
          total: parseInt(row.total, 10),
          successful: parseInt(row.successful, 10),
          failed: parseInt(row.failed, 10),
          opened: parseInt(row.opened, 10),
          successRate: row.total > 0 ? ((row.successful / row.total) * 100).toFixed(1) : 0,
        }))
      );
    } catch (error) {
      logger.error("[EmailQueue] By type error:", error);
      res.status(500).json({ error: "Failed to get stats by type" });
    }
  }
);

export default router;
