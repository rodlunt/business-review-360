/**
 * Digest Email Routes
 *
 * API endpoints for previewing and testing digest emails.
 * Production sending is handled by scheduled jobs.
 *
 * Issue #444: Digest and summary email templates
 */

import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { renderEmail } from "../emails/utils/renderEmail.js";
import { WeeklyUserSummary } from "../emails/templates/digest/WeeklyUserSummary.jsx";
import { MonthlyAdminSummary } from "../emails/templates/digest/MonthlyAdminSummary.jsx";
import { QuarterlyReport } from "../emails/templates/digest/QuarterlyReport.jsx";
import { logger } from "../utils/logger.js";
import {
  previewWeeklySummary,
  previewMonthlySummary,
  previewQuarterlyReport,
  sendWeeklyUserSummaries,
  sendMonthlyAdminSummaries,
  sendQuarterlyReports,
} from "../services/digestEmailService.js";

const router = express.Router();

/**
 * GET /api/digest/weekly-summary/preview
 * Preview the weekly summary email for the current user
 */
router.get("/weekly-summary/preview", async (req, res) => {
  try {
    const preview = await previewWeeklySummary(req.user.id, req.user.organizationId);
    const { html, text } = await renderEmail(WeeklyUserSummary, preview.props);

    res.json({
      success: true,
      template: preview.template,
      props: preview.props,
      html,
      text,
    });
  } catch (error) {
    logger.error("[Digest] Preview error:", error);
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

/**
 * GET /api/digest/monthly-summary/preview
 * Preview the monthly admin summary (admin only)
 */
router.get("/monthly-summary/preview", requireAdmin, async (req, res) => {
  try {
    const preview = await previewMonthlySummary(req.user.id, req.user.organizationId);
    const { html, text } = await renderEmail(MonthlyAdminSummary, preview.props);

    res.json({
      success: true,
      template: preview.template,
      props: preview.props,
      html,
      text,
    });
  } catch (error) {
    logger.error("[Digest] Preview error:", error);
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

/**
 * GET /api/digest/quarterly-report/preview
 * Preview the quarterly report email
 */
router.get("/quarterly-report/preview", async (req, res) => {
  try {
    const preview = await previewQuarterlyReport(req.user.id, req.user.organizationId);
    const { html, text } = await renderEmail(QuarterlyReport, preview.props);

    res.json({
      success: true,
      template: preview.template,
      props: preview.props,
      html,
      text,
    });
  } catch (error) {
    logger.error("[Digest] Preview error:", error);
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

/**
 * POST /api/digest/send-test
 * Send a test digest email to the current admin (admin only)
 */
router.post("/send-test", requireAdmin, async (req, res) => {
  try {
    const { type = "weekly" } = req.body;
    const organizationId = req.user.organizationId;

    let result;
    switch (type) {
      case "weekly":
        result = await sendWeeklyUserSummaries(organizationId);
        break;
      case "monthly":
        result = await sendMonthlyAdminSummaries(organizationId);
        break;
      case "quarterly":
        result = await sendQuarterlyReports(organizationId);
        break;
      default:
        return res
          .status(400)
          .json({ error: "Invalid digest type. Use: weekly, monthly, quarterly" });
    }

    res.json({
      success: true,
      type,
      ...result,
    });
  } catch (error) {
    logger.error("[Digest] Send test error:", error);
    res.status(500).json({ error: "Failed to send test digest" });
  }
});

/**
 * GET /api/digest/stats
 * Get current stats that would be included in digests (admin only)
 */
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const { period = "month" } = req.query;
    const organizationId = req.user.organizationId;

    const {
      getDateRanges,
      getOrganizationIdeaStats,
      getTopContributors,
      getEngagementMetrics,
      getTotalTimeSaved,
      getPendingReviewCount,
    } = await import("../services/statsService.js");

    const ranges = getDateRanges();
    let start, end;

    switch (period) {
      case "week":
        start = ranges.week.start;
        end = ranges.week.end;
        break;
      case "quarter":
        start = ranges.quarter.start;
        end = ranges.quarter.end;
        break;
      case "month":
      default:
        start = ranges.month.start;
        end = ranges.month.end;
    }

    const [ideaStats, contributors, engagement, timeSaved, pendingReview] = await Promise.all([
      getOrganizationIdeaStats(organizationId, start, end),
      getTopContributors(organizationId, start, end, 5),
      getEngagementMetrics(organizationId, start, end),
      getTotalTimeSaved(organizationId, start, end),
      getPendingReviewCount(organizationId),
    ]);

    res.json({
      success: true,
      period,
      dateRange: { start, end },
      stats: {
        ideas: ideaStats,
        topContributors: contributors,
        engagement,
        totalTimeSavedMinutes: timeSaved,
        pendingReviewCount: pendingReview,
      },
    });
  } catch (error) {
    logger.error("[Digest] Stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

export default router;
