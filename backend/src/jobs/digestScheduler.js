/**
 * Digest Email Scheduler
 *
 * Scheduled jobs for sending periodic digest emails.
 * Uses node-cron for scheduling.
 *
 * Issue #444: Digest and summary email templates
 *
 * Schedule:
 * - Weekly user summary: Every Monday at 9 AM
 * - Monthly admin summary: 1st of each month at 9 AM
 * - Quarterly report: 1st of Jan, Apr, Jul, Oct at 9 AM
 * - Re-engagement emails: Daily at 10 AM
 * - Satisfaction surveys: Quarterly
 * - Token cleanup: Daily at 2 AM
 * - Hourly/daily/weekly digest batching
 *
 * Configuration via environment variables:
 * - DIGEST_TIMEZONE: Timezone for scheduling (default: America/New_York)
 * - DIGEST_ENABLED: Set to 'true' to enable (default: false in dev)
 * - WEEKLY_DIGEST_HOUR: Hour to send weekly digest (default: 9)
 * - MONTHLY_DIGEST_HOUR: Hour to send monthly digest (default: 9)
 *
 * Issue #747: queue/health/analytics/log-cleanup crons used to live here too
 * but are now owned by `emailQueueWorker.js` (always-on, no DIGEST_ENABLED
 * gate) since they back transactional email infrastructure, not digests.
 */

import cron from "node-cron";
import {
  sendWeeklyUserSummaries,
  sendMonthlyAdminSummaries,
  sendQuarterlyReports,
} from "../services/digestEmailService.js";
import {
  sendReengagementEmails,
  sendSatisfactionSurveys,
  cleanupExpiredTokens,
} from "../services/engagementEmailService.js";
import { batchDigestEmails } from "../services/emailQueueService.js";
import { logger } from "../utils/logger.js";

// Check if digest scheduling is enabled
const isEnabled = () => {
  // Disabled by default in development
  if (process.env.NODE_ENV !== "production" && process.env.DIGEST_ENABLED !== "true") {
    return false;
  }
  return process.env.DIGEST_ENABLED !== "false";
};

// Get schedule configuration
const getConfig = () => ({
  timezone: process.env.DIGEST_TIMEZONE || "America/New_York",
  weeklyHour: parseInt(process.env.WEEKLY_DIGEST_HOUR || "9", 10),
  monthlyHour: parseInt(process.env.MONTHLY_DIGEST_HOUR || "9", 10),
});

// Track scheduled jobs
const jobs = {
  weekly: null,
  monthly: null,
  quarterly: null,
  reengagement: null,
  surveys: null,
  cleanup: null,
  hourlyBatch: null,
  dailyBatch: null,
  weeklyBatch: null,
};

/**
 * Initialize the digest scheduler
 * Call this during server startup
 */
export function initializeDigestScheduler() {
  if (!isEnabled()) {
    logger.info(
      "[Digest Scheduler] Disabled in current environment. Set DIGEST_ENABLED=true to enable."
    );
    return;
  }

  const config = getConfig();
  logger.info(`[Digest Scheduler] Initializing with timezone: ${config.timezone}`);

  // Weekly user summary - Every Monday at configured hour
  // Cron: minute hour dayOfMonth month dayOfWeek
  // '0 9 * * 1' = At 9:00 AM on Monday
  const weeklyCron = `0 ${config.weeklyHour} * * 1`;
  jobs.weekly = cron.schedule(
    weeklyCron,
    async () => {
      logger.info("[Digest Scheduler] Running weekly user summaries...");
      try {
        const result = await sendWeeklyUserSummaries();
        logger.info(
          `[Digest Scheduler] Weekly complete: ${result.sent} sent, ${result.skipped} skipped`
        );
      } catch (error) {
        logger.error("[Digest Scheduler] Weekly job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Digest Scheduler] Weekly summary scheduled: ${weeklyCron} ${config.timezone}`);

  // Monthly admin summary - 1st of each month at configured hour
  // '0 9 1 * *' = At 9:00 AM on day 1 of every month
  const monthlyCron = `0 ${config.monthlyHour} 1 * *`;
  jobs.monthly = cron.schedule(
    monthlyCron,
    async () => {
      logger.info("[Digest Scheduler] Running monthly admin summaries...");
      try {
        const result = await sendMonthlyAdminSummaries();
        logger.info(
          `[Digest Scheduler] Monthly complete: ${result.sent} sent, ${result.skipped} skipped`
        );
      } catch (error) {
        logger.error("[Digest Scheduler] Monthly job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Digest Scheduler] Monthly summary scheduled: ${monthlyCron} ${config.timezone}`);

  // Quarterly report - 1st of Feb, May, Aug, Nov at configured hour
  // '0 9 1 2,5,8,11 *' = At 9:00 AM on day 1 of Feb, May, Aug, Nov
  const quarterlyCron = `0 ${config.monthlyHour} 1 2,5,8,11 *`;
  jobs.quarterly = cron.schedule(
    quarterlyCron,
    async () => {
      logger.info("[Digest Scheduler] Running quarterly reports...");
      try {
        const result = await sendQuarterlyReports();
        logger.info(
          `[Digest Scheduler] Quarterly complete: ${result.sent} sent, ${result.skipped} skipped`
        );
      } catch (error) {
        logger.error("[Digest Scheduler] Quarterly job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Digest Scheduler] Quarterly report scheduled: ${quarterlyCron} ${config.timezone}`);

  // Re-engagement emails - Daily at 10 AM (Issue #445)
  // '0 10 * * *' = At 10:00 AM every day
  const reengagementCron = `0 10 * * *`;
  jobs.reengagement = cron.schedule(
    reengagementCron,
    async () => {
      logger.info("[Digest Scheduler] Running re-engagement emails...");
      try {
        const result = await sendReengagementEmails();
        logger.info(
          `[Digest Scheduler] Re-engagement complete: ${result.sent} sent, ${result.skipped} skipped`
        );
      } catch (error) {
        logger.error("[Digest Scheduler] Re-engagement job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(
    `[Digest Scheduler] Re-engagement emails scheduled: ${reengagementCron} ${config.timezone}`
  );

  // Satisfaction surveys - Quarterly (offset from reports)
  // '0 11 1 2,5,8,11 *' = At 11:00 AM on day 1 of Feb, May, Aug, Nov
  const surveysCron = `0 11 1 2,5,8,11 *`;
  jobs.surveys = cron.schedule(
    surveysCron,
    async () => {
      logger.info("[Digest Scheduler] Running satisfaction surveys...");
      try {
        const result = await sendSatisfactionSurveys();
        logger.info(
          `[Digest Scheduler] Surveys complete: ${result.sent} sent, ${result.skipped} skipped`
        );
      } catch (error) {
        logger.error("[Digest Scheduler] Survey job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(
    `[Digest Scheduler] Satisfaction surveys scheduled: ${surveysCron} ${config.timezone}`
  );

  // Cleanup expired tokens - Daily at 2 AM
  // '0 2 * * *' = At 2:00 AM every day
  const cleanupCron = `0 2 * * *`;
  jobs.cleanup = cron.schedule(
    cleanupCron,
    async () => {
      logger.info("[Digest Scheduler] Running token cleanup...");
      try {
        const deleted = await cleanupExpiredTokens();
        logger.info(`[Digest Scheduler] Cleanup complete: ${deleted} tokens removed`);
      } catch (error) {
        logger.error("[Digest Scheduler] Cleanup job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Digest Scheduler] Token cleanup scheduled: ${cleanupCron} ${config.timezone}`);

  // Hourly digest batching - Every hour at :00
  // '0 * * * *' = At minute 0 of every hour
  const hourlyBatchCron = `0 * * * *`;
  jobs.hourlyBatch = cron.schedule(
    hourlyBatchCron,
    async () => {
      logger.info("[Digest Scheduler] Running hourly batch...");
      try {
        await batchDigestEmails("hourly");
        logger.info("[Digest Scheduler] Hourly batch complete");
      } catch (error) {
        logger.error("[Digest Scheduler] Hourly batch failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Digest Scheduler] Hourly batch scheduled: ${hourlyBatchCron} ${config.timezone}`);

  // Daily digest batching - Every day at 9 AM
  // '0 9 * * *' = At 9:00 AM every day
  const dailyBatchCron = `0 ${config.weeklyHour} * * *`;
  jobs.dailyBatch = cron.schedule(
    dailyBatchCron,
    async () => {
      logger.info("[Digest Scheduler] Running daily batch...");
      try {
        await batchDigestEmails("daily");
        logger.info("[Digest Scheduler] Daily batch complete");
      } catch (error) {
        logger.error("[Digest Scheduler] Daily batch failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Digest Scheduler] Daily batch scheduled: ${dailyBatchCron} ${config.timezone}`);

  // Weekly digest batching - Every Monday at 9 AM (before user summaries)
  // '55 8 * * 1' = At 8:55 AM on Monday
  const weeklyBatchCron = `55 ${config.weeklyHour - 1} * * 1`;
  jobs.weeklyBatch = cron.schedule(
    weeklyBatchCron,
    async () => {
      logger.info("[Digest Scheduler] Running weekly batch...");
      try {
        await batchDigestEmails("weekly");
        logger.info("[Digest Scheduler] Weekly batch complete");
      } catch (error) {
        logger.error("[Digest Scheduler] Weekly batch failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Digest Scheduler] Weekly batch scheduled: ${weeklyBatchCron} ${config.timezone}`);

  logger.info("[Digest Scheduler] All jobs initialized successfully");
}

/**
 * Stop all scheduled jobs
 * Call this during graceful shutdown
 */
export function stopDigestScheduler() {
  logger.info("[Digest Scheduler] Stopping all jobs...");

  Object.entries(jobs).forEach(([name, job]) => {
    if (job) {
      job.stop();
      logger.info(`[Digest Scheduler] Stopped ${name} job`);
    }
  });

  logger.info("[Digest Scheduler] All jobs stopped");
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    enabled: isEnabled(),
    config: getConfig(),
    jobs: {
      weekly: jobs.weekly ? "running" : "stopped",
      monthly: jobs.monthly ? "running" : "stopped",
      quarterly: jobs.quarterly ? "running" : "stopped",
      reengagement: jobs.reengagement ? "running" : "stopped",
      surveys: jobs.surveys ? "running" : "stopped",
      cleanup: jobs.cleanup ? "running" : "stopped",
      hourlyBatch: jobs.hourlyBatch ? "running" : "stopped",
      dailyBatch: jobs.dailyBatch ? "running" : "stopped",
      weeklyBatch: jobs.weeklyBatch ? "running" : "stopped",
    },
  };
}

/**
 * Manually trigger a digest job (for testing)
 */
export async function triggerDigestJob(type) {
  logger.info(`[Digest Scheduler] Manually triggering ${type} job...`);

  switch (type) {
    case "weekly":
      return sendWeeklyUserSummaries();
    case "monthly":
      return sendMonthlyAdminSummaries();
    case "quarterly":
      return sendQuarterlyReports();
    case "reengagement":
      return sendReengagementEmails();
    case "surveys":
      return sendSatisfactionSurveys();
    case "cleanup":
      return cleanupExpiredTokens();
    case "hourlyBatch":
      return batchDigestEmails("hourly");
    case "dailyBatch":
      return batchDigestEmails("daily");
    case "weeklyBatch":
      return batchDigestEmails("weekly");
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

export default {
  initializeDigestScheduler,
  stopDigestScheduler,
  getSchedulerStatus,
  triggerDigestJob,
};
