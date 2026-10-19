/**
 * Ops metrics cron job (#848)
 *
 * Thin cron wiring around opsMetricsService.js for the minimal ops
 * dashboard: samples EmailQueue depth every 5 minutes and prunes
 * ErrorEvents/MetricsSamples older than 90 days once a day. All logic
 * lives in the service; this file only schedules it, per the portability
 * principle that background jobs must map to Azure Container Apps
 * scheduled jobs later without a rewrite.
 */

import cron from "node-cron";
import { sampleEmailQueue, pruneOpsMetrics } from "../services/opsMetricsService.js";
import { logger } from "../utils/logger.js";

const jobs = {
  sampler: null,
  pruner: null,
};

const getConfig = () => ({
  timezone: process.env.OPS_METRICS_TIMEZONE || "UTC",
});

export function initializeOpsMetricsJob() {
  const config = getConfig();

  const samplerCron = "*/5 * * * *";
  jobs.sampler = cron.schedule(
    samplerCron,
    async () => {
      try {
        await sampleEmailQueue();
      } catch (error) {
        logger.error("[OpsMetrics] Sampler tick failed", { message: error.message });
      }
    },
    { scheduled: true, timezone: config.timezone }
  );

  const prunerCron = "0 3 * * *";
  jobs.pruner = cron.schedule(
    prunerCron,
    async () => {
      try {
        await pruneOpsMetrics();
      } catch (error) {
        logger.error("[OpsMetrics] Prune tick failed", { message: error.message });
      }
    },
    { scheduled: true, timezone: config.timezone }
  );

  logger.info(
    `[OpsMetrics] Scheduled: sampler=${samplerCron}, prune=${prunerCron} (${config.timezone})`
  );
}

export function stopOpsMetricsJob() {
  if (jobs.sampler) {
    jobs.sampler.stop();
    jobs.sampler = null;
  }
  if (jobs.pruner) {
    jobs.pruner.stop();
    jobs.pruner = null;
  }
  logger.info("[OpsMetrics] Stopped");
}

export default {
  initializeOpsMetricsJob,
  stopOpsMetricsJob,
};
