/**
 * Ops metrics service (#848)
 *
 * Data-layer logic for the minimal ops dashboard: sampling EmailQueue depth
 * into MetricsSamples, and pruning both ErrorEvents and MetricsSamples to a
 * 90-day retention window. Cron wiring (opsMetricsJob.js) stays thin and
 * only calls into these two functions, per the portability principle that
 * background-job logic must live in service classes so jobs map cleanly to
 * Azure Container Apps scheduled jobs later.
 */

import { Op } from "sequelize";
import EmailQueue from "../models/EmailQueue.js";
import ErrorEvent from "../models/ErrorEvent.js";
import MagicLinkToken from "../models/MagicLinkToken.js";
import MetricsSample from "../models/MetricsSample.js";
import { logger } from "../utils/logger.js";

export const RETENTION_DAYS = 90;

// #987: MagicLinkTokens rows are single-use records for 15-minute tokens;
// anything expired for over a day is pure history. A separate, much shorter
// window than the metrics retention above.
export const MAGIC_LINK_PRUNE_HOURS = 24;

/**
 * Count current pending/failed EmailQueue rows and write one MetricsSamples
 * snapshot row. Runs every 5 minutes via opsMetricsJob.js.
 */
export async function sampleEmailQueue() {
  const [pending, failed] = await Promise.all([
    EmailQueue.count({ where: { status: "pending" } }),
    EmailQueue.count({ where: { status: "failed" } }),
  ]);

  const sample = await MetricsSample.create({
    emailQueuePending: pending,
    emailQueueFailed: failed,
  });

  logger.info(`[OpsMetrics] Sampled EmailQueue: pending=${pending}, failed=${failed}`);

  return sample;
}

/**
 * Delete ErrorEvents and MetricsSamples rows older than RETENTION_DAYS.
 * Runs daily via opsMetricsJob.js.
 */
export async function pruneOpsMetrics() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // #987: prune long-expired magic-link token records in the same daily
  // sweep. Keyed on expiresAt (not consumedAt) so unredeemed tokens age out
  // the same way as consumed ones.
  const magicLinkCutoff = new Date(Date.now() - MAGIC_LINK_PRUNE_HOURS * 60 * 60 * 1000);

  const [errorEventsDeleted, metricsSamplesDeleted, magicLinkTokensDeleted] = await Promise.all([
    ErrorEvent.destroy({ where: { createdAt: { [Op.lt]: cutoff } } }),
    MetricsSample.destroy({ where: { sampledAt: { [Op.lt]: cutoff } } }),
    MagicLinkToken.destroy({ where: { expiresAt: { [Op.lt]: magicLinkCutoff } } }),
  ]);

  if (errorEventsDeleted > 0 || metricsSamplesDeleted > 0 || magicLinkTokensDeleted > 0) {
    logger.info(
      `[OpsMetrics] Pruned ${errorEventsDeleted} ErrorEvents and ${metricsSamplesDeleted} MetricsSamples older than ${cutoff.toISOString()}, and ${magicLinkTokensDeleted} MagicLinkTokens expired before ${magicLinkCutoff.toISOString()}`
    );
  }

  return { errorEventsDeleted, metricsSamplesDeleted, magicLinkTokensDeleted, cutoff };
}
