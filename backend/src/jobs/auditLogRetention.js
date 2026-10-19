/**
 * Audit log retention job.
 *
 * Issue #590: hard-deletes audit_logs rows older than AUDIT_LOG_RETENTION_DAYS
 * (default 90), runs daily at 03:00 UTC. Writes a maintenance.audit_log_pruned
 * self-audit row when rows_deleted > 0 (silent on zero-row runs).
 *
 * Spec: docs/superpowers/specs/2026-04-25-audit-log-retention-design.md
 * Operator-facing policy: docs/AUDIT_POLICY.md (Retention section)
 */

import cron from "node-cron";
import { QueryTypes } from "sequelize";
import { platformSequelize } from "../models/platformDatabase.js";
import { AuditLog } from "../middleware/auditLog.js";
import { logger } from "../utils/logger.js";

let job = null;

export function resolveRetentionDays() {
  const raw = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

export function resolveCronExpression() {
  return process.env.AUDIT_LOG_PRUNE_CRON || "0 3 * * *";
}

export function isPruneEnabled() {
  const raw = process.env.AUDIT_LOG_PRUNE_ENABLED;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function isAuditLoggingDisabled() {
  return process.env.ENABLE_AUDIT_LOGGING === "false";
}

export async function pruneOnce() {
  if (isAuditLoggingDisabled()) {
    logger.info("[AuditLogRetention] skipped, ENABLE_AUDIT_LOGGING=false");
    return { skipped: "audit-disabled" };
  }
  if (!isPruneEnabled()) {
    logger.info(
      "[AuditLogRetention] skipped, pruning not enabled (AUDIT_LOG_PRUNE_ENABLED=false or NODE_ENV!=production)"
    );
    return { skipped: "prune-disabled" };
  }

  const retentionDays = resolveRetentionDays();
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  try {
    // COUNT then DELETE (two queries) for sqlite test-harness portability;
    // see spec D2. rowsDeleted reflects the count at COUNT time, not the
    // actual DELETE return; the gap is bounded and operationally negligible
    // (cutoff is 90+ days old, so no new rows can fall into the window).
    const countResult = await platformSequelize.query(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE created_at < :cutoff",
      {
        replacements: { cutoff: cutoffIso },
        type: QueryTypes.SELECT,
      }
    );
    const rowsDeleted = Number(countResult[0]?.count ?? 0);

    if (rowsDeleted > 0) {
      await platformSequelize.query("DELETE FROM audit_logs WHERE created_at < :cutoff", {
        replacements: { cutoff: cutoffIso },
        type: QueryTypes.DELETE,
      });

      logger.info(`[AuditLogRetention] pruned ${rowsDeleted} rows older than ${cutoffIso}`);

      await AuditLog.create({
        action: "maintenance.audit_log_pruned",
        actor_email: "system",
        actor_role: "system",
        resource_type: "audit_logs",
        metadata: {
          rows_deleted: rowsDeleted,
          cutoff_iso: cutoffIso,
          retention_days: retentionDays,
        },
        status: "success",
      });
    } else {
      logger.info(
        `[AuditLogRetention] nothing to prune (cutoff ${cutoffIso}, retention ${retentionDays}d)`
      );
    }

    return { rowsDeleted, cutoffIso, retentionDays };
  } catch (error) {
    logger.error("[AuditLogRetention] prune failed", error);
    try {
      await AuditLog.create({
        action: "maintenance.audit_log_pruned",
        actor_email: "system",
        actor_role: "system",
        resource_type: "audit_logs",
        metadata: {
          error: error.message,
          retention_days: retentionDays,
        },
        status: "failure",
      });
    } catch (innerError) {
      logger.error("[AuditLogRetention] failed to write failure self-audit row", innerError);
    }
    return { error: error.message };
  }
}

export const triggerPrune = pruneOnce;

export function initializeAuditLogRetention() {
  if (!isPruneEnabled()) {
    logger.info(
      "[AuditLogRetention] disabled in current environment. Set AUDIT_LOG_PRUNE_ENABLED=true to enable."
    );
    return;
  }

  const expr = resolveCronExpression();

  job = cron.schedule(
    expr,
    async () => {
      logger.info("[AuditLogRetention] cron tick");
      try {
        await pruneOnce();
      } catch (error) {
        logger.error("[AuditLogRetention] tick failed", error);
      }
    },
    { scheduled: true, timezone: "UTC" }
  );

  logger.info(`[AuditLogRetention] scheduled: ${expr} UTC, retention=${resolveRetentionDays()}d`);
}

export function stopAuditLogRetention() {
  if (job) {
    job.stop();
    job = null;
    logger.info("[AuditLogRetention] stopped");
  }
}

export function getStatus() {
  return {
    running: job !== null,
    config: {
      retentionDays: resolveRetentionDays(),
      cron: resolveCronExpression(),
      pruneEnabled: isPruneEnabled(),
      auditDisabled: isAuditLoggingDisabled(),
    },
  };
}

export default {
  initializeAuditLogRetention,
  stopAuditLogRetention,
  getStatus,
  triggerPrune,
};
