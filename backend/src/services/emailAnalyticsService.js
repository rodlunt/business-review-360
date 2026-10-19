/**
 * Email Analytics Service
 *
 * Provides analytics and metrics for email performance tracking.
 *
 * Issue #448: Email analytics and monitoring dashboard
 */

import { Op, fn, col, literal } from "sequelize";
import EmailLog from "../models/EmailLog.js";
import EmailAnalytics from "../models/EmailAnalytics.js";
import { logger } from "../utils/logger.js";

// Alert thresholds (can be configured via environment variables)
const THRESHOLDS = {
  bounceRateCritical: parseFloat(process.env.EMAIL_BOUNCE_RATE_CRITICAL || "10"),
  bounceRateWarning: parseFloat(process.env.EMAIL_BOUNCE_RATE_WARNING || "5"),
  spamRateCritical: parseFloat(process.env.EMAIL_SPAM_RATE_CRITICAL || "0.1"),
  unsubscribeRateWarning: parseFloat(process.env.EMAIL_UNSUBSCRIBE_RATE_WARNING || "2"),
  openRateWarning: parseFloat(process.env.EMAIL_OPEN_RATE_WARNING || "20"),
  deliveryRateWarning: parseFloat(process.env.EMAIL_DELIVERY_RATE_WARNING || "95"),
  deliveryRateCritical: parseFloat(process.env.EMAIL_DELIVERY_RATE_CRITICAL || "90"),
};

/**
 * Aggregate email analytics for a specific organization and date
 * @param {string} organizationId - Organization ID (null for global)
 * @param {Date} date - Date to aggregate
 */
export async function aggregateEmailAnalytics(organizationId, date = new Date()) {
  const dateOnly = date.toISOString().split("T")[0];
  const startOfDay = new Date(dateOnly);
  const endOfDay = new Date(dateOnly);
  endOfDay.setDate(endOfDay.getDate() + 1);

  try {
    // Get all email types for this org/date
    const emailTypes = await EmailLog.findAll({
      attributes: [[fn("DISTINCT", col("type")), "type"]],
      where: {
        organizationId: organizationId || null,
        sentAt: {
          [Op.gte]: startOfDay,
          [Op.lt]: endOfDay,
        },
      },
      raw: true,
    });

    // Aggregate for each email type
    for (const { type } of emailTypes) {
      await aggregateForType(organizationId, type, startOfDay, endOfDay);
    }

    // Also aggregate totals (null emailType = all types)
    await aggregateForType(organizationId, null, startOfDay, endOfDay);

    logger.info(`[Analytics] Aggregated for org=${organizationId || "global"}, date=${dateOnly}`);
  } catch (error) {
    logger.error("[Analytics] Aggregation error:", error);
    throw error;
  }
}

/**
 * Aggregate analytics for a specific email type
 */
async function aggregateForType(organizationId, emailType, startOfDay, endOfDay) {
  const whereClause = {
    sentAt: {
      [Op.gte]: startOfDay,
      [Op.lt]: endOfDay,
    },
  };

  if (organizationId) {
    whereClause.organizationId = organizationId;
  }

  if (emailType) {
    whereClause.type = emailType;
  }

  // Count metrics
  const stats = await EmailLog.findOne({
    attributes: [
      [fn("COUNT", col("id")), "sent"],
      [fn("COUNT", col("deliveredAt")), "delivered"],
      [fn("SUM", literal('CASE WHEN "openCount" > 0 THEN 1 ELSE 0 END')), "uniqueOpens"],
      [fn("SUM", col("openCount")), "opened"],
      [fn("SUM", literal('CASE WHEN "clickCount" > 0 THEN 1 ELSE 0 END')), "uniqueClicks"],
      [fn("SUM", col("clickCount")), "clicked"],
      [fn("COUNT", col("bouncedAt")), "bounced"],
      [fn("SUM", literal("CASE WHEN \"bounceType\" = 'soft' THEN 1 ELSE 0 END")), "softBounced"],
      [fn("SUM", literal("CASE WHEN \"bounceType\" = 'hard' THEN 1 ELSE 0 END")), "hardBounced"],
      [fn("COUNT", col("droppedAt")), "dropped"],
      [fn("COUNT", col("spamReportedAt")), "spamReported"],
      [fn("COUNT", col("unsubscribedViaEmailAt")), "unsubscribed"],
    ],
    where: whereClause,
    raw: true,
  });

  // Upsert analytics record
  const dateOnly = startOfDay.toISOString().split("T")[0];

  await EmailAnalytics.upsert({
    organizationId: organizationId || null,
    emailType: emailType || null,
    date: dateOnly,
    sent: parseInt(stats.sent) || 0,
    delivered: parseInt(stats.delivered) || 0,
    opened: parseInt(stats.opened) || 0,
    uniqueOpens: parseInt(stats.uniqueOpens) || 0,
    clicked: parseInt(stats.clicked) || 0,
    uniqueClicks: parseInt(stats.uniqueClicks) || 0,
    bounced: parseInt(stats.bounced) || 0,
    softBounced: parseInt(stats.softBounced) || 0,
    hardBounced: parseInt(stats.hardBounced) || 0,
    dropped: parseInt(stats.dropped) || 0,
    spamReported: parseInt(stats.spamReported) || 0,
    unsubscribed: parseInt(stats.unsubscribed) || 0,
  });
}

/**
 * Get email analytics summary for an organization
 * @param {string} organizationId - Organization ID
 * @param {number} days - Number of days to include (default 30)
 */
export async function getAnalyticsSummary(organizationId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  // Get totals for the period
  const totals = await EmailAnalytics.findOne({
    attributes: [
      [fn("SUM", col("sent")), "sent"],
      [fn("SUM", col("delivered")), "delivered"],
      [fn("SUM", col("opened")), "opened"],
      [fn("SUM", col("uniqueOpens")), "uniqueOpens"],
      [fn("SUM", col("clicked")), "clicked"],
      [fn("SUM", col("uniqueClicks")), "uniqueClicks"],
      [fn("SUM", col("bounced")), "bounced"],
      [fn("SUM", col("softBounced")), "softBounced"],
      [fn("SUM", col("hardBounced")), "hardBounced"],
      [fn("SUM", col("dropped")), "dropped"],
      [fn("SUM", col("spamReported")), "spamReported"],
      [fn("SUM", col("unsubscribed")), "unsubscribed"],
    ],
    where: {
      organizationId: organizationId || null,
      emailType: null, // Total across all types
      date: {
        [Op.gte]: startDate,
      },
    },
    raw: true,
  });

  // Calculate rates
  const sent = parseInt(totals?.sent) || 0;
  const delivered = parseInt(totals?.delivered) || 0;
  const opened = parseInt(totals?.uniqueOpens) || 0;
  const clicked = parseInt(totals?.uniqueClicks) || 0;
  const bounced = parseInt(totals?.bounced) || 0;
  const spamReported = parseInt(totals?.spamReported) || 0;
  const unsubscribed = parseInt(totals?.unsubscribed) || 0;

  const metrics = {
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    spamReported,
    unsubscribed,
    deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(1) : 0,
    openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : 0,
    clickThroughRate: delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : 0,
    clickToOpenRate: opened > 0 ? ((clicked / opened) * 100).toFixed(1) : 0,
    bounceRate: sent > 0 ? ((bounced / sent) * 100).toFixed(2) : 0,
    spamRate: delivered > 0 ? ((spamReported / delivered) * 100).toFixed(3) : 0,
    unsubscribeRate: delivered > 0 ? ((unsubscribed / delivered) * 100).toFixed(2) : 0,
  };

  return {
    period: { days, startDate, endDate: new Date() },
    totals: {
      sent,
      delivered,
      opened: parseInt(totals?.opened) || 0,
      uniqueOpens: opened,
      clicked: parseInt(totals?.clicked) || 0,
      uniqueClicks: clicked,
      bounced,
      softBounced: parseInt(totals?.softBounced) || 0,
      hardBounced: parseInt(totals?.hardBounced) || 0,
      dropped: parseInt(totals?.dropped) || 0,
      spamReported,
      unsubscribed,
    },
    metrics,
  };
}

/**
 * Get analytics by email type
 * @param {string} organizationId - Organization ID
 * @param {number} days - Number of days to include
 */
export async function getAnalyticsByType(organizationId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const results = await EmailAnalytics.findAll({
    attributes: [
      "emailType",
      [fn("SUM", col("sent")), "sent"],
      [fn("SUM", col("delivered")), "delivered"],
      [fn("SUM", col("uniqueOpens")), "uniqueOpens"],
      [fn("SUM", col("uniqueClicks")), "uniqueClicks"],
      [fn("SUM", col("bounced")), "bounced"],
      [fn("SUM", col("spamReported")), "spamReported"],
      [fn("SUM", col("unsubscribed")), "unsubscribed"],
    ],
    where: {
      organizationId: organizationId || null,
      emailType: {
        [Op.ne]: null,
      },
      date: {
        [Op.gte]: startDate,
      },
    },
    group: ["emailType"],
    raw: true,
  });

  return results.map((row) => {
    const sent = parseInt(row.sent) || 0;
    const delivered = parseInt(row.delivered) || 0;
    const opened = parseInt(row.uniqueOpens) || 0;
    const clicked = parseInt(row.uniqueClicks) || 0;
    const bounced = parseInt(row.bounced) || 0;
    const spamReported = parseInt(row.spamReported) || 0;

    return {
      emailType: row.emailType,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      spamReported,
      unsubscribed: parseInt(row.unsubscribed) || 0,
      openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : 0,
      clickThroughRate: delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : 0,
      bounceRate: sent > 0 ? ((bounced / sent) * 100).toFixed(2) : 0,
      status: getHealthStatus(sent, delivered, bounced, spamReported, opened),
    };
  });
}

/**
 * Get time series data for charts
 * @param {string} organizationId - Organization ID
 * @param {number} days - Number of days
 * @param {string} emailType - Filter by email type (optional)
 */
export async function getTimeSeries(organizationId, days = 30, emailType = null) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const whereClause = {
    organizationId: organizationId || null,
    date: {
      [Op.gte]: startDate,
    },
  };

  if (emailType) {
    whereClause.emailType = emailType;
  } else {
    whereClause.emailType = null; // Total across all types
  }

  const results = await EmailAnalytics.findAll({
    attributes: [
      "date",
      "sent",
      "delivered",
      "uniqueOpens",
      "uniqueClicks",
      "bounced",
      "spamReported",
    ],
    where: whereClause,
    order: [["date", "ASC"]],
    raw: true,
  });

  return results.map((row) => ({
    date: row.date,
    sent: row.sent || 0,
    delivered: row.delivered || 0,
    opened: row.uniqueOpens || 0,
    clicked: row.uniqueClicks || 0,
    bounced: row.bounced || 0,
    spamReported: row.spamReported || 0,
  }));
}

/**
 * Get recent email logs
 * @param {string} organizationId - Organization ID
 * @param {number} limit - Maximum number of logs to return
 * @param {object} filters - Optional filters
 */
export async function getRecentLogs(organizationId, limit = 100, filters = {}) {
  const whereClause = {};

  if (organizationId) {
    whereClause.organizationId = organizationId;
  }

  if (filters.status) {
    whereClause.status = filters.status;
  }

  if (filters.type) {
    whereClause.type = filters.type;
  }

  if (filters.startDate) {
    whereClause.sentAt = {
      [Op.gte]: new Date(filters.startDate),
    };
  }

  const logs = await EmailLog.findAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    attributes: [
      "id",
      "type",
      "to",
      "subject",
      "status",
      "sentAt",
      "deliveredAt",
      "openedAt",
      "clickedAt",
      "bouncedAt",
      "bounceType",
      "bounceReason",
      "spamReportedAt",
      "openCount",
      "clickCount",
      "error",
    ],
  });

  return logs;
}

/**
 * Get single email log details
 */
export async function getEmailLogById(id, organizationId) {
  const whereClause = { id };

  if (organizationId) {
    whereClause.organizationId = organizationId;
  }

  return EmailLog.findOne({ where: whereClause });
}

/**
 * Get health status and alerts
 * @param {string} organizationId - Organization ID
 */
export async function getHealthStatus(sent, delivered, bounced, spamReported, opened) {
  const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
  const spamRate = delivered > 0 ? (spamReported / delivered) * 100 : 0;
  const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
  const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;

  // Determine status
  if (spamRate >= THRESHOLDS.spamRateCritical) {
    return "critical";
  }
  if (bounceRate >= THRESHOLDS.bounceRateCritical) {
    return "critical";
  }
  if (deliveryRate < THRESHOLDS.deliveryRateCritical) {
    return "critical";
  }
  if (bounceRate >= THRESHOLDS.bounceRateWarning) {
    return "warning";
  }
  if (deliveryRate < THRESHOLDS.deliveryRateWarning) {
    return "warning";
  }
  if (openRate < THRESHOLDS.openRateWarning) {
    return "low-engagement";
  }

  return "healthy";
}

/**
 * Get alerts for email health issues
 * @param {string} organizationId - Organization ID
 * @param {number} days - Days to analyze
 */
export async function getAlerts(organizationId, days = 30) {
  const summary = await getAnalyticsSummary(organizationId, days);
  const byType = await getAnalyticsByType(organizationId, days);
  const alerts = [];

  const { metrics } = summary;

  // Check critical thresholds
  if (parseFloat(metrics.spamRate) >= THRESHOLDS.spamRateCritical) {
    alerts.push({
      level: "critical",
      type: "spam_rate",
      message: `Spam complaint rate is ${metrics.spamRate}% (threshold: ${THRESHOLDS.spamRateCritical}%)`,
      value: metrics.spamRate,
      threshold: THRESHOLDS.spamRateCritical,
    });
  }

  if (parseFloat(metrics.bounceRate) >= THRESHOLDS.bounceRateCritical) {
    alerts.push({
      level: "critical",
      type: "bounce_rate",
      message: `Bounce rate is ${metrics.bounceRate}% (threshold: ${THRESHOLDS.bounceRateCritical}%)`,
      value: metrics.bounceRate,
      threshold: THRESHOLDS.bounceRateCritical,
    });
  }

  if (parseFloat(metrics.deliveryRate) < THRESHOLDS.deliveryRateCritical) {
    alerts.push({
      level: "critical",
      type: "delivery_rate",
      message: `Delivery rate is ${metrics.deliveryRate}% (threshold: ${THRESHOLDS.deliveryRateCritical}%)`,
      value: metrics.deliveryRate,
      threshold: THRESHOLDS.deliveryRateCritical,
    });
  }

  // Check warning thresholds
  if (
    parseFloat(metrics.bounceRate) >= THRESHOLDS.bounceRateWarning &&
    parseFloat(metrics.bounceRate) < THRESHOLDS.bounceRateCritical
  ) {
    alerts.push({
      level: "warning",
      type: "bounce_rate",
      message: `Bounce rate is elevated at ${metrics.bounceRate}% (target: <${THRESHOLDS.bounceRateWarning}%)`,
      value: metrics.bounceRate,
      threshold: THRESHOLDS.bounceRateWarning,
    });
  }

  if (
    parseFloat(metrics.deliveryRate) < THRESHOLDS.deliveryRateWarning &&
    parseFloat(metrics.deliveryRate) >= THRESHOLDS.deliveryRateCritical
  ) {
    alerts.push({
      level: "warning",
      type: "delivery_rate",
      message: `Delivery rate is below target at ${metrics.deliveryRate}% (target: >${THRESHOLDS.deliveryRateWarning}%)`,
      value: metrics.deliveryRate,
      threshold: THRESHOLDS.deliveryRateWarning,
    });
  }

  // Check per-type alerts
  for (const typeStats of byType) {
    if (parseFloat(typeStats.openRate) < THRESHOLDS.openRateWarning) {
      alerts.push({
        level: "info",
        type: "low_engagement",
        emailType: typeStats.emailType,
        message: `${typeStats.emailType}: Open rate is ${typeStats.openRate}% (target: >${THRESHOLDS.openRateWarning}%)`,
        value: typeStats.openRate,
        threshold: THRESHOLDS.openRateWarning,
      });
    }

    if (parseFloat(typeStats.bounceRate) >= THRESHOLDS.bounceRateCritical) {
      alerts.push({
        level: "critical",
        type: "bounce_rate",
        emailType: typeStats.emailType,
        message: `${typeStats.emailType}: Bounce rate is ${typeStats.bounceRate}%`,
        value: typeStats.bounceRate,
        threshold: THRESHOLDS.bounceRateCritical,
      });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.level] - severityOrder[b.level]);

  return alerts;
}

/**
 * Get overall health check
 */
export async function getHealthCheck(organizationId) {
  const [summary, alerts] = await Promise.all([
    getAnalyticsSummary(organizationId, 7), // Last 7 days
    getAlerts(organizationId, 7),
  ]);

  const criticalAlerts = alerts.filter((a) => a.level === "critical");
  const warningAlerts = alerts.filter((a) => a.level === "warning");

  let status = "healthy";
  if (criticalAlerts.length > 0) {
    status = "critical";
  } else if (warningAlerts.length > 0) {
    status = "warning";
  }

  return {
    status,
    summary: summary.metrics,
    alerts,
    lastChecked: new Date(),
  };
}

/**
 * Daily aggregation job - aggregate yesterday's data
 */
export async function runDailyAggregation() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  logger.info("[Analytics] Running daily aggregation for:", yesterday.toISOString().split("T")[0]);

  try {
    // Get all organizations with email logs from yesterday
    const organizations = await EmailLog.findAll({
      attributes: [[fn("DISTINCT", col("organizationId")), "organizationId"]],
      where: {
        sentAt: {
          [Op.gte]: yesterday,
          [Op.lt]: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      raw: true,
    });

    // Aggregate for each organization
    for (const { organizationId } of organizations) {
      await aggregateEmailAnalytics(organizationId, yesterday);
    }

    // Also aggregate global stats
    await aggregateEmailAnalytics(null, yesterday);

    logger.info(`[Analytics] Daily aggregation complete for ${organizations.length} organizations`);

    return { organizations: organizations.length };
  } catch (error) {
    logger.error("[Analytics] Daily aggregation failed:", error);
    throw error;
  }
}

/**
 * Cleanup old email logs (keep last N days)
 * @param {number} retentionDays - Days to keep
 */
export async function cleanupOldLogs(retentionDays = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const deleted = await EmailLog.destroy({
    where: {
      createdAt: {
        [Op.lt]: cutoffDate,
      },
    },
  });

  logger.info(`[Analytics] Cleaned up ${deleted} email logs older than ${retentionDays} days`);

  return deleted;
}

export default {
  aggregateEmailAnalytics,
  getAnalyticsSummary,
  getAnalyticsByType,
  getTimeSeries,
  getRecentLogs,
  getEmailLogById,
  getHealthCheck,
  getAlerts,
  runDailyAggregation,
  cleanupOldLogs,
};
