/**
 * Email Queue Worker
 *
 * Always-on cron registrations for transactional-email infrastructure.
 * Owns the queue processor (#446) plus queue/log/analytics maintenance jobs
 * that PR #743 made load-bearing for every email send.
 *
 * Issue #747: these jobs used to live inside `digestScheduler.js`, which is
 * gated on `DIGEST_ENABLED`. With #743 routing all transactional sends through
 * the queue, gating the worker on a digest feature flag silently dropped every
 * transactional email when DIGEST_ENABLED=false. The fix is to register queue
 * infrastructure unconditionally, independent of digest scheduling.
 *
 * Schedule:
 * - Queue processor: every minute
 * - Queue cleanup (>30d entries): daily 3am
 * - Queue health monitor: every 5 minutes
 * - Email analytics aggregation: daily 4am
 * - Email log cleanup (>90d by default): weekly Sunday 3am
 *
 * Configuration:
 * - EMAIL_QUEUE_TIMEZONE (preferred) or DIGEST_TIMEZONE (legacy fallback)
 * - EMAIL_LOG_RETENTION_DAYS: log retention window (default 90)
 *
 * No enable/disable env gate. The worker MUST register or transactional email
 * silently regresses (see #747 detection log).
 */

import cron from "node-cron";
import {
  processQueue,
  cleanupOldEntries,
  monitorQueueHealth,
  recoverStuckSending,
} from "../services/emailQueueService.js";
import { runDailyAggregation, cleanupOldLogs } from "../services/emailAnalyticsService.js";
import { runTrialReminderJob } from "./trialReminderJob.js";
import { logger } from "../utils/logger.js";
import { notifyError } from "../utils/ntfy.js";

const getConfig = () => ({
  timezone: process.env.EMAIL_QUEUE_TIMEZONE || process.env.DIGEST_TIMEZONE || "UTC",
});

const jobs = {
  queueProcessor: null,
  queueCleanup: null,
  healthMonitor: null,
  analyticsAggregation: null,
  logCleanup: null,
  trialReminder: null,
};

export async function initializeEmailQueueWorker() {
  const config = getConfig();
  logger.info(`[Email Queue Worker] Initializing with timezone: ${config.timezone}`);

  // #822: reset any rows left in 'sending' from a previous crashed run before
  // scheduling the cron, so they are retried on the first tick.
  await recoverStuckSending();

  const queueProcessorCron = `* * * * *`;
  jobs.queueProcessor = cron.schedule(
    queueProcessorCron,
    async () => {
      try {
        const result = await processQueue(50);
        if (result.processed > 0) {
          logger.info(
            `[Queue Processor] Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}`
          );
        }
      } catch (error) {
        logger.error("[Queue Processor] Job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Email Queue Worker] Queue processor scheduled: ${queueProcessorCron}`);

  const queueCleanupCron = `0 3 * * *`;
  jobs.queueCleanup = cron.schedule(
    queueCleanupCron,
    async () => {
      logger.info("[Email Queue Worker] Running queue cleanup...");
      try {
        const deleted = await cleanupOldEntries(30);
        logger.info(`[Email Queue Worker] Queue cleanup complete: ${deleted} entries removed`);
      } catch (error) {
        logger.error("[Email Queue Worker] Queue cleanup failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(
    `[Email Queue Worker] Queue cleanup scheduled: ${queueCleanupCron} ${config.timezone}`
  );

  const healthMonitorCron = `*/5 * * * *`;
  jobs.healthMonitor = cron.schedule(
    healthMonitorCron,
    async () => {
      try {
        const health = await monitorQueueHealth();
        if (health.status !== "healthy") {
          logger.warn(`[Queue Health] Status: ${health.status}`, health.issues);
        }
        // #815: a 'critical' status means the failure rate is over 10%, i.e.
        // emails (including payment and auth mail) are not being delivered.
        // This is the #735 incident class: Resend bouncing every send went
        // unnoticed for weeks because the path only logged. Push an alert via
        // the existing ntfy channel. notifyError is rate-limited internally
        // (5-minute per-fingerprint cooldown), and this cron only ticks every
        // 5 minutes, so a persistently critical queue alerts at most once per
        // tick rather than spamming. 'warning' (backlog, stale, low rate
        // limit) stays log-only to avoid alert fatigue.
        if (health.status === "critical") {
          const issues = (health.issues || []).join("; ") || "unspecified";
          notifyError(
            "[BR360] Email queue CRITICAL",
            `Email queue failure rate critical -- emails (incl. payment/auth) may not be delivered.\nIssues: ${issues}`,
            { priority: 5 }
          ).catch(() => {});
        }
      } catch (error) {
        logger.error("[Queue Health] Check failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Email Queue Worker] Health monitor scheduled: ${healthMonitorCron}`);

  const analyticsAggregationCron = `0 4 * * *`;
  jobs.analyticsAggregation = cron.schedule(
    analyticsAggregationCron,
    async () => {
      logger.info("[Email Queue Worker] Running email analytics aggregation...");
      try {
        const result = await runDailyAggregation();
        logger.info(
          `[Email Queue Worker] Analytics aggregation complete: ${result.organizations} orgs processed`
        );
      } catch (error) {
        logger.error("[Email Queue Worker] Analytics aggregation failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(
    `[Email Queue Worker] Analytics aggregation scheduled: ${analyticsAggregationCron} ${config.timezone}`
  );

  const logCleanupCron = `0 3 * * 0`;
  jobs.logCleanup = cron.schedule(
    logCleanupCron,
    async () => {
      logger.info("[Email Queue Worker] Running email log cleanup...");
      try {
        const retentionDays = parseInt(process.env.EMAIL_LOG_RETENTION_DAYS || "90", 10);
        const deleted = await cleanupOldLogs(retentionDays);
        logger.info(`[Email Queue Worker] Log cleanup complete: ${deleted} logs removed`);
      } catch (error) {
        logger.error("[Email Queue Worker] Log cleanup failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(`[Email Queue Worker] Log cleanup scheduled: ${logCleanupCron} ${config.timezone}`);

  // Trial reminder: check active trials daily at 9am and flip expired ones. (#531)
  const trialReminderCron = `0 9 * * *`;
  jobs.trialReminder = cron.schedule(
    trialReminderCron,
    async () => {
      try {
        await runTrialReminderJob();
      } catch (error) {
        logger.error("[Email Queue Worker] Trial reminder job failed:", error);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone,
    }
  );

  logger.info(
    `[Email Queue Worker] Trial reminder scheduled: ${trialReminderCron} ${config.timezone}`
  );
  logger.info("[Email Queue Worker] All jobs initialized successfully");
}

export function stopEmailQueueWorker() {
  logger.info("[Email Queue Worker] Stopping all jobs...");

  Object.entries(jobs).forEach(([name, job]) => {
    if (job) {
      job.stop();
      logger.info(`[Email Queue Worker] Stopped ${name} job`);
    }
  });

  logger.info("[Email Queue Worker] All jobs stopped");
}

export function getEmailQueueWorkerStatus() {
  return {
    config: getConfig(),
    jobs: {
      queueProcessor: jobs.queueProcessor ? "running" : "stopped",
      queueCleanup: jobs.queueCleanup ? "running" : "stopped",
      healthMonitor: jobs.healthMonitor ? "running" : "stopped",
      analyticsAggregation: jobs.analyticsAggregation ? "running" : "stopped",
      logCleanup: jobs.logCleanup ? "running" : "stopped",
    },
  };
}

export async function triggerEmailQueueJob(type) {
  logger.info(`[Email Queue Worker] Manually triggering ${type} job...`);

  switch (type) {
    case "queueProcessor":
      return processQueue(50);
    case "queueCleanup":
      return cleanupOldEntries(30);
    case "healthMonitor":
      return monitorQueueHealth();
    case "analyticsAggregation":
      return runDailyAggregation();
    case "logCleanup":
      return cleanupOldLogs(parseInt(process.env.EMAIL_LOG_RETENTION_DAYS || "90", 10));
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

export default {
  initializeEmailQueueWorker,
  stopEmailQueueWorker,
  getEmailQueueWorkerStatus,
  triggerEmailQueueJob,
};
