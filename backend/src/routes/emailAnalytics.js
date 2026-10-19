/**
 * Email Analytics Routes
 *
 * API endpoints for email performance analytics and monitoring.
 * Admin-only access.
 *
 * Issue #448: Email analytics and monitoring dashboard
 */

import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { auditLogger } from "../middleware/auditLog.js";
import { logger } from "../utils/logger.js";
import {
  getAnalyticsSummary,
  getAnalyticsByType,
  getTimeSeries,
  getRecentLogs,
  getEmailLogById,
  getHealthCheck,
  getAlerts,
  runDailyAggregation,
} from "../services/emailAnalyticsService.js";

const router = express.Router();

/**
 * GET /api/admin/email-analytics
 *
 * Get email analytics summary for the organization.
 * Query params:
 *   - days: Number of days to include (default 30)
 */
router.get(
  "/",
  auditLogger({ action: "email-analytics.summary.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const organizationId = req.user.organizationId;

      const summary = await getAnalyticsSummary(organizationId, parseInt(days));

      res.json(summary);
    } catch (error) {
      logger.error("[Email Analytics] Summary error:", error);
      res.status(500).json({ error: "Failed to get analytics summary" });
    }
  }
);

/**
 * GET /api/admin/email-analytics/by-type
 *
 * Get analytics broken down by email type.
 * Query params:
 *   - days: Number of days to include (default 30)
 */
router.get(
  "/by-type",
  auditLogger({ action: "email-analytics.by-type.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const organizationId = req.user.organizationId;

      const byType = await getAnalyticsByType(organizationId, parseInt(days));

      res.json({ emailTypes: byType });
    } catch (error) {
      logger.error("[Email Analytics] By-type error:", error);
      res.status(500).json({ error: "Failed to get analytics by type" });
    }
  }
);

/**
 * GET /api/admin/email-analytics/time-series
 *
 * Get time series data for charts.
 * Query params:
 *   - days: Number of days (default 30)
 *   - type: Filter by email type (optional)
 */
router.get(
  "/time-series",
  auditLogger({ action: "email-analytics.time-series.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { days = 30, type } = req.query;
      const organizationId = req.user.organizationId;

      const data = await getTimeSeries(organizationId, parseInt(days), type || null);

      res.json({ data });
    } catch (error) {
      logger.error("[Email Analytics] Time-series error:", error);
      res.status(500).json({ error: "Failed to get time series data" });
    }
  }
);

/**
 * GET /api/admin/email-analytics/logs
 *
 * Get recent email logs.
 * Query params:
 *   - limit: Max number of logs (default 100)
 *   - status: Filter by status
 *   - type: Filter by email type
 *   - startDate: Filter by start date
 */
router.get(
  "/logs",
  auditLogger({ action: "email-analytics.logs.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { limit = 100, status, type, startDate } = req.query;
      const organizationId = req.user.organizationId;

      const logs = await getRecentLogs(organizationId, parseInt(limit), {
        status,
        type,
        startDate,
      });

      res.json({ logs });
    } catch (error) {
      logger.error("[Email Analytics] Logs error:", error);
      res.status(500).json({ error: "Failed to get email logs" });
    }
  }
);

/**
 * GET /api/admin/email-analytics/logs/:id
 *
 * Get details for a specific email log.
 */
router.get(
  "/logs/:id",
  auditLogger({ action: "email-analytics.logs.detail.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const organizationId = req.user.organizationId;

      const log = await getEmailLogById(id, organizationId);

      if (!log) {
        return res.status(404).json({ error: "Email log not found" });
      }

      res.json(log);
    } catch (error) {
      logger.error("[Email Analytics] Log detail error:", error);
      res.status(500).json({ error: "Failed to get email log details" });
    }
  }
);

/**
 * GET /api/admin/email-analytics/health
 *
 * Get email health check status.
 */
router.get(
  "/health",
  auditLogger({ action: "email-analytics.health.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const organizationId = req.user.organizationId;

      const health = await getHealthCheck(organizationId);

      res.json(health);
    } catch (error) {
      logger.error("[Email Analytics] Health check error:", error);
      res.status(500).json({ error: "Failed to get health status" });
    }
  }
);

/**
 * GET /api/admin/email-analytics/alerts
 *
 * Get active alerts for email issues.
 * Query params:
 *   - days: Number of days to analyze (default 30)
 */
router.get(
  "/alerts",
  auditLogger({ action: "email-analytics.alerts.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const organizationId = req.user.organizationId;

      const alerts = await getAlerts(organizationId, parseInt(days));

      res.json({ alerts });
    } catch (error) {
      logger.error("[Email Analytics] Alerts error:", error);
      res.status(500).json({ error: "Failed to get alerts" });
    }
  }
);

/**
 * POST /api/admin/email-analytics/aggregate
 *
 * Manually trigger analytics aggregation.
 * For debugging/admin use.
 */
router.post(
  "/aggregate",
  auditLogger({
    action: "email-analytics.aggregate",
    resourceType: "email_analytics",
    captureBody: true,
  }),
  requireAdmin,
  async (req, res) => {
    try {
      const result = await runDailyAggregation();

      res.json({
        success: true,
        message: "Aggregation completed",
        ...result,
      });
    } catch (error) {
      logger.error("[Email Analytics] Manual aggregation error:", error);
      res.status(500).json({ error: "Failed to run aggregation" });
    }
  }
);

/**
 * GET /api/admin/email-analytics/dashboard
 *
 * Get all data needed for the analytics dashboard in one call.
 * Optimized for frontend to reduce API calls.
 */
router.get(
  "/dashboard",
  auditLogger({ action: "email-analytics.dashboard.view", resourceType: "email_analytics" }),
  requireAdmin,
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const organizationId = req.user.organizationId;
      const daysInt = parseInt(days);

      // Fetch all data in parallel
      const [summary, byType, timeSeries, alerts, recentLogs] = await Promise.all([
        getAnalyticsSummary(organizationId, daysInt),
        getAnalyticsByType(organizationId, daysInt),
        getTimeSeries(organizationId, daysInt, null),
        getAlerts(organizationId, daysInt),
        getRecentLogs(organizationId, 20, {}),
      ]);

      res.json({
        summary,
        emailTypes: byType,
        timeSeries,
        alerts,
        recentLogs,
        period: {
          days: daysInt,
          startDate: summary.period.startDate,
          endDate: summary.period.endDate,
        },
      });
    } catch (error) {
      logger.error("[Email Analytics] Dashboard error:", error);
      res.status(500).json({ error: "Failed to get dashboard data" });
    }
  }
);

export default router;
