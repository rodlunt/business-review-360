/**
 * Digest Email Service
 *
 * Handles generating and sending periodic digest emails.
 * Integrates with stats service and notification preferences.
 *
 * Issue #444: Digest and summary email templates
 */

import { enqueueTemplateEmail, EmailPriority } from "./emailQueueService.js";
import { WeeklyUserSummary } from "../emails/templates/digest/WeeklyUserSummary.jsx";
import { MonthlyAdminSummary } from "../emails/templates/digest/MonthlyAdminSummary.jsx";
import { QuarterlyReport } from "../emails/templates/digest/QuarterlyReport.jsx";
import {
  getDateRanges,
  getUserActivityStats,
  getOrganizationIdeaStats,
  getTopContributors,
  getEngagementMetrics,
  getTopIdeas,
  getRecentImplementations,
  getPendingReviewCount,
  getTotalTimeSaved,
  getWatchedIdeasUpdates,
  calculateCostSavings,
  getPreviousPeriodStats,
  calculateTrend,
} from "./statsService.js";
import { shouldSendNotification, NotificationType } from "../utils/notificationChecker.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import { logger } from "../utils/logger.js";

/**
 * Format date for display
 */
function formatDate(date) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Get organization settings for email branding
 */
async function getOrgBranding(organizationId) {
  try {
    const organization = await Organization.findByPk(organizationId);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    return {
      organizationName: organization?.name || "Business Review 360",
      primaryColor: organization?.primaryColor || "#1565c0",
      logoUrl: organization?.logoUrl ? `${frontendUrl}${organization.logoUrl}` : null,
      frontendUrl,
    };
  } catch (error) {
    logger.error("Error getting org branding:", error);
    return {
      organizationName: "Business Review 360",
      primaryColor: "#1565c0",
      logoUrl: null,
      frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
    };
  }
}

/**
 * Send weekly user summary to all opted-in users
 */
export async function sendWeeklyUserSummaries(organizationId = null) {
  logger.info("[Digest] Starting weekly user summaries...");

  const ranges = getDateRanges();
  const weekStart = formatDate(ranges.week.start);
  const weekEnd = formatDate(ranges.week.end);

  // Get all organizations or a specific one
  const whereOrg = organizationId ? { id: organizationId } : {};
  const organizations = await Organization.findAll({ where: whereOrg });

  let sent = 0;
  let skipped = 0;

  for (const org of organizations) {
    const branding = await getOrgBranding(org.id);

    // Get users who want weekly summaries
    const users = await User.findAll({
      where: {
        organizationId: org.id,
        isApproved: true,
      },
    });

    for (const user of users) {
      try {
        // Check if user wants weekly summaries
        const shouldSend = await shouldSendNotification(user.id, NotificationType.WEEKLY_SUMMARY);
        if (!shouldSend) {
          skipped++;
          continue;
        }

        // Get user-specific data
        const userStats = await getUserActivityStats(
          user.id,
          org.id,
          ranges.week.start,
          ranges.week.end
        );

        const watchedIdeasUpdates = await getWatchedIdeasUpdates(
          user.id,
          org.id,
          ranges.week.start
        );

        const topIdeas = await getTopIdeas(org.id, ranges.week.start, ranges.week.end, 3);
        const recentImplementations = await getRecentImplementations(
          org.id,
          ranges.week.start,
          ranges.week.end,
          3
        );

        // Check if there's anything to report
        const hasContent =
          userStats.ideasSubmitted > 0 ||
          userStats.commentsMade > 0 ||
          watchedIdeasUpdates.length > 0 ||
          topIdeas.length > 0 ||
          recentImplementations.length > 0;

        if (!hasContent) {
          logger.info(`[Digest] Skipping ${user.email} - no content`);
          skipped++;
          continue;
        }

        const result = await enqueueTemplateEmail({
          to: user.email,
          subject: `Your weekly summary - ${branding.organizationName}`,
          template: WeeklyUserSummary,
          templateProps: {
            userName: user.username || user.email.split("@")[0],
            userStats,
            watchedIdeasUpdates,
            topIdeas,
            recentImplementations,
            weekStartDate: weekStart,
            weekEndDate: weekEnd,
            browseIdeasUrl: `${branding.frontendUrl}/ideas`,
            submitIdeaUrl: `${branding.frontendUrl}/submit`,
            preferencesUrl: `${branding.frontendUrl}/settings/notifications`,
            ...branding,
          },
          categories: ["digest", "weekly-summary"],
          type: "weekly-user-summary",
          priority: EmailPriority.LOW,
          organizationId: org.id,
          userId: user.id,
        });

        if (result.success) {
          sent++;
          logger.info(`[Digest] Weekly summary queued for ${user.email}`);
        } else {
          logger.error(`[Digest] Failed to queue weekly summary for ${user.email}:`, {
            error: result.error,
          });
        }
      } catch (error) {
        logger.error(`[Digest] Error sending to ${user.email}:`, error);
      }
    }
  }

  logger.info(`[Digest] Weekly summaries complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

/**
 * Send monthly admin summary to all organization admins
 */
export async function sendMonthlyAdminSummaries(organizationId = null) {
  logger.info("[Digest] Starting monthly admin summaries...");

  const ranges = getDateRanges();
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(ranges.month.start);
  const year = ranges.month.start.getFullYear();

  // Get all organizations or a specific one
  const whereOrg = organizationId ? { id: organizationId } : {};
  const organizations = await Organization.findAll({ where: whereOrg });

  let sent = 0;
  let skipped = 0;

  for (const org of organizations) {
    const branding = await getOrgBranding(org.id);

    // Get admin users
    const admins = await User.findAll({
      where: {
        organizationId: org.id,
        isAdmin: true,
        isApproved: true,
      },
    });

    // Get org-wide stats once
    const stats = await getOrganizationIdeaStats(org.id, ranges.month.start, ranges.month.end);
    const previousStats = await getPreviousPeriodStats(org.id, "month");
    const trends = {
      submitted: calculateTrend(stats.submitted, previousStats.submitted),
    };

    const topContributors = await getTopContributors(
      org.id,
      ranges.month.start,
      ranges.month.end,
      5
    );
    const engagement = await getEngagementMetrics(org.id, ranges.month.start, ranges.month.end);
    const pendingReviewCount = await getPendingReviewCount(org.id);
    const totalTimeSavedMinutes = await getTotalTimeSaved(
      org.id,
      ranges.month.start,
      ranges.month.end
    );

    for (const admin of admins) {
      try {
        // Check if admin wants monthly summaries
        const shouldSend = await shouldSendNotification(
          admin.id,
          NotificationType.ADMIN_MONTHLY_SUMMARY
        );
        if (!shouldSend) {
          skipped++;
          continue;
        }

        // Build action items
        const actionItems = [];
        if (pendingReviewCount > 10) {
          actionItems.push({
            icon: "\u26A0\uFE0F",
            title: "High review backlog",
            description: `${pendingReviewCount} ideas are awaiting review`,
            url: `${branding.frontendUrl}/ideas?status=Reviewing`,
            actionText: "Review Ideas",
          });
        }
        if (engagement.activeUserPercent < 30) {
          actionItems.push({
            icon: "\uD83D\uDC65",
            title: "Low engagement",
            description: `Only ${engagement.activeUserPercent}% of users were active this month`,
          });
        }

        const result = await enqueueTemplateEmail({
          to: admin.email,
          subject: `Monthly Summary: ${monthName} ${year} - ${branding.organizationName}`,
          template: MonthlyAdminSummary,
          templateProps: {
            adminName: admin.username || admin.email.split("@")[0],
            month: monthName,
            year,
            stats,
            trends,
            topContributors,
            pendingReviewCount,
            totalComments: engagement.totalComments,
            totalVotes: engagement.totalVotes,
            activeUserPercent: engagement.activeUserPercent,
            totalTimeSavedMinutes,
            actionItems,
            dashboardUrl: `${branding.frontendUrl}/analytics`,
            reviewUrl: `${branding.frontendUrl}/ideas?status=Reviewing`,
            preferencesUrl: `${branding.frontendUrl}/settings/notifications`,
            ...branding,
          },
          categories: ["digest", "monthly-summary", "admin"],
          type: "monthly-admin-summary",
          priority: EmailPriority.LOW,
          organizationId: org.id,
          userId: admin.id,
        });

        if (result.success) {
          sent++;
          logger.info(`[Digest] Monthly summary queued for ${admin.email}`);
        } else {
          logger.error(`[Digest] Failed to queue monthly summary for ${admin.email}:`, {
            error: result.error,
          });
        }
      } catch (error) {
        logger.error(`[Digest] Error sending to ${admin.email}:`, error);
      }
    }
  }

  logger.info(`[Digest] Monthly summaries complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

/**
 * Send quarterly report to all opted-in users and admins
 */
export async function sendQuarterlyReports(organizationId = null) {
  logger.info("[Digest] Starting quarterly reports...");

  const ranges = getDateRanges();
  const { quarter, year, start, end } = ranges.quarter;

  // Get all organizations or a specific one
  const whereOrg = organizationId ? { id: organizationId } : {};
  const organizations = await Organization.findAll({ where: whereOrg });

  let sent = 0;
  let skipped = 0;

  for (const org of organizations) {
    const branding = await getOrgBranding(org.id);

    // Get org-wide stats
    const stats = await getOrganizationIdeaStats(org.id, start, end);
    const totalTimeSavedMinutes = await getTotalTimeSaved(org.id, start, end);
    const estimatedCostSavings = calculateCostSavings(totalTimeSavedMinutes);

    const topContributors = await getTopContributors(org.id, start, end, 5);
    const topIdeas = await getTopIdeas(org.id, start, end, 5);
    const majorImplementations = await getRecentImplementations(org.id, start, end, 5);
    const engagement = await getEngagementMetrics(org.id, start, end);

    const participationStats = {
      activeUsers: engagement.activeUsers,
      totalUsers: engagement.totalUsers,
      percentActive: engagement.activeUserPercent,
    };

    // Get users who want quarterly reports (all users + admins)
    const users = await User.findAll({
      where: {
        organizationId: org.id,
        isApproved: true,
      },
    });

    for (const user of users) {
      try {
        // Check if user wants monthly reports (quarterly uses same preference)
        const shouldSend = await shouldSendNotification(user.id, NotificationType.MONTHLY_REPORTS);
        if (!shouldSend) {
          skipped++;
          continue;
        }

        // Check if there's anything to report
        if (stats.submitted === 0 && stats.implemented === 0) {
          logger.info(`[Digest] Skipping ${user.email} - no quarterly content`);
          skipped++;
          continue;
        }

        const result = await enqueueTemplateEmail({
          to: user.email,
          subject: `Q${quarter} ${year} Report - ${branding.organizationName} Achievements`,
          template: QuarterlyReport,
          templateProps: {
            recipientName: user.username || user.email.split("@")[0],
            quarter,
            year,
            stats: {
              submitted: stats.submitted,
              implemented: stats.implemented,
              totalTimeSavedMinutes,
              estimatedCostSavings,
            },
            majorImplementations,
            topIdeas,
            topContributors,
            participationStats,
            successStories: [],
            nextQuarterGoals: [],
            achievementsUrl: `${branding.frontendUrl}/ideas?status=Implemented`,
            submitIdeaUrl: `${branding.frontendUrl}/submit`,
            preferencesUrl: `${branding.frontendUrl}/settings/notifications`,
            ...branding,
          },
          categories: ["digest", "quarterly-report"],
          type: "quarterly-report",
          priority: EmailPriority.LOW,
          organizationId: org.id,
          userId: user.id,
        });

        if (result.success) {
          sent++;
          logger.info(`[Digest] Quarterly report queued for ${user.email}`);
        } else {
          logger.error(`[Digest] Failed to queue quarterly report for ${user.email}:`, {
            error: result.error,
          });
        }
      } catch (error) {
        logger.error(`[Digest] Error sending to ${user.email}:`, error);
      }
    }
  }

  logger.info(`[Digest] Quarterly reports complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

/**
 * Generate preview of weekly summary (for testing)
 */
export async function previewWeeklySummary(userId, organizationId) {
  const ranges = getDateRanges();
  const weekStart = formatDate(ranges.week.start);
  const weekEnd = formatDate(ranges.week.end);
  const branding = await getOrgBranding(organizationId);
  const user = await User.findByPk(userId);

  const userStats = await getUserActivityStats(
    userId,
    organizationId,
    ranges.week.start,
    ranges.week.end
  );
  const watchedIdeasUpdates = await getWatchedIdeasUpdates(
    userId,
    organizationId,
    ranges.week.start
  );
  const topIdeas = await getTopIdeas(organizationId, ranges.week.start, ranges.week.end, 3);
  const recentImplementations = await getRecentImplementations(
    organizationId,
    ranges.week.start,
    ranges.week.end,
    3
  );

  return {
    template: "WeeklyUserSummary",
    props: {
      userName: user?.username || user?.email?.split("@")[0] || "User",
      userStats,
      watchedIdeasUpdates,
      topIdeas,
      recentImplementations,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      browseIdeasUrl: `${branding.frontendUrl}/ideas`,
      submitIdeaUrl: `${branding.frontendUrl}/submit`,
      preferencesUrl: `${branding.frontendUrl}/settings/notifications`,
      ...branding,
    },
  };
}

/**
 * Generate preview of monthly admin summary (for testing)
 */
export async function previewMonthlySummary(adminId, organizationId) {
  const ranges = getDateRanges();
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(ranges.month.start);
  const year = ranges.month.start.getFullYear();
  const branding = await getOrgBranding(organizationId);
  const admin = await User.findByPk(adminId);

  const stats = await getOrganizationIdeaStats(
    organizationId,
    ranges.month.start,
    ranges.month.end
  );
  const previousStats = await getPreviousPeriodStats(organizationId, "month");
  const trends = { submitted: calculateTrend(stats.submitted, previousStats.submitted) };
  const topContributors = await getTopContributors(
    organizationId,
    ranges.month.start,
    ranges.month.end,
    5
  );
  const engagement = await getEngagementMetrics(
    organizationId,
    ranges.month.start,
    ranges.month.end
  );
  const pendingReviewCount = await getPendingReviewCount(organizationId);
  const totalTimeSavedMinutes = await getTotalTimeSaved(
    organizationId,
    ranges.month.start,
    ranges.month.end
  );

  return {
    template: "MonthlyAdminSummary",
    props: {
      adminName: admin?.username || admin?.email?.split("@")[0] || "Admin",
      month: monthName,
      year,
      stats,
      trends,
      topContributors,
      pendingReviewCount,
      totalComments: engagement.totalComments,
      totalVotes: engagement.totalVotes,
      activeUserPercent: engagement.activeUserPercent,
      totalTimeSavedMinutes,
      actionItems: [],
      dashboardUrl: `${branding.frontendUrl}/analytics`,
      reviewUrl: `${branding.frontendUrl}/ideas?status=Reviewing`,
      preferencesUrl: `${branding.frontendUrl}/settings/notifications`,
      ...branding,
    },
  };
}

/**
 * Generate preview of quarterly report (for testing)
 */
export async function previewQuarterlyReport(userId, organizationId) {
  const ranges = getDateRanges();
  const { quarter, year, start, end } = ranges.quarter;
  const branding = await getOrgBranding(organizationId);
  const user = await User.findByPk(userId);

  const stats = await getOrganizationIdeaStats(organizationId, start, end);
  const totalTimeSavedMinutes = await getTotalTimeSaved(organizationId, start, end);
  const estimatedCostSavings = calculateCostSavings(totalTimeSavedMinutes);
  const topContributors = await getTopContributors(organizationId, start, end, 5);
  const topIdeas = await getTopIdeas(organizationId, start, end, 5);
  const majorImplementations = await getRecentImplementations(organizationId, start, end, 5);
  const engagement = await getEngagementMetrics(organizationId, start, end);

  return {
    template: "QuarterlyReport",
    props: {
      recipientName: user?.username || user?.email?.split("@")[0] || "User",
      quarter,
      year,
      stats: {
        submitted: stats.submitted,
        implemented: stats.implemented,
        totalTimeSavedMinutes,
        estimatedCostSavings,
      },
      majorImplementations,
      topIdeas,
      topContributors,
      participationStats: {
        activeUsers: engagement.activeUsers,
        totalUsers: engagement.totalUsers,
        percentActive: engagement.activeUserPercent,
      },
      successStories: [],
      nextQuarterGoals: [],
      achievementsUrl: `${branding.frontendUrl}/ideas?status=Implemented`,
      submitIdeaUrl: `${branding.frontendUrl}/submit`,
      preferencesUrl: `${branding.frontendUrl}/settings/notifications`,
      ...branding,
    },
  };
}

export default {
  sendWeeklyUserSummaries,
  sendMonthlyAdminSummaries,
  sendQuarterlyReports,
  previewWeeklySummary,
  previewMonthlySummary,
  previewQuarterlyReport,
};
