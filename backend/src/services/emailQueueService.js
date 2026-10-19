/**
 * Email Queue Service
 *
 * Manages email queuing, processing, retry logic, and batching.
 *
 * Issue #446: Email queue and scheduling system
 */

import { Op } from "sequelize";
import EmailQueue from "../models/EmailQueue.js";
import EmailLog from "../models/EmailLog.js";
import User from "../models/User.js";
import { sendRawEmail } from "../emails/utils/sendEmail.js";
import { renderEmail } from "../emails/utils/renderEmail.js";
import { shouldSendNotification, getEmailFrequency } from "../utils/notificationChecker.js";
import { logger } from "../utils/logger.js";
import { withTenantContext } from "../utils/withTenantContext.js";
import { getTenantByOrganizationId } from "../middleware/tenantResolver.js";

/**
 * Email priority levels.
 *
 * Re-exported from the leaf module `emailPriority.js` so this service stays
 * the canonical queue API surface, but callers that only need the constants
 * (e.g. `userService.js` under #865) can import from the leaf without
 * dragging in the queue/model graph and breaking tests that mock individual
 * models. See memory `project_leaf_service_sequelize_import`.
 */
export { EmailPriority } from "./emailPriority.js";
import { EmailPriority } from "./emailPriority.js";

/**
 * Rate limiter state
 */
const rateLimiter = {
  count: 0,
  resetAt: Date.now() + 3600000, // 1 hour
  limit: parseInt(process.env.EMAIL_QUEUE_RATE_LIMIT || "1000", 10),
};

/**
 * Check and update rate limit
 * @returns {boolean} True if under rate limit
 */
function checkRateLimit() {
  if (Date.now() > rateLimiter.resetAt) {
    rateLimiter.count = 0;
    rateLimiter.resetAt = Date.now() + 3600000;
  }

  if (rateLimiter.count >= rateLimiter.limit) {
    return false;
  }

  rateLimiter.count++;
  return true;
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus() {
  return {
    count: rateLimiter.count,
    limit: rateLimiter.limit,
    remaining: Math.max(0, rateLimiter.limit - rateLimiter.count),
    resetAt: new Date(rateLimiter.resetAt),
  };
}

/**
 * Enqueue an email for sending
 * @param {object} options Email options
 * @returns {Promise<EmailQueue>} Created queue entry
 */
export async function enqueueEmail({
  userId,
  organizationId,
  type,
  to,
  subject,
  data,
  priority = EmailPriority.NORMAL,
  scheduledFor = new Date(),
  maxAttempts = 3,
}) {
  // If userId provided but no email, look it up
  let emailTo = to;
  if (!emailTo && userId) {
    const user = await User.findByPk(userId);
    if (user?.email) {
      emailTo = user.email;
    }
  }

  return EmailQueue.create({
    userId,
    organizationId,
    type,
    to: emailTo,
    subject,
    data,
    priority,
    scheduledFor,
    maxAttempts,
    status: "pending",
  });
}

/**
 * Render a React Email template and enqueue the result for durable, retried
 * delivery via the queue worker.
 *
 * Use this for every transactional email path. Direct calls to
 * sendTemplateEmail bypass the queue and lose the retry budget + the
 * `EmailQueue.status='failed'` audit trail used to detect provider
 * regressions (#735 hid for an unknown number of weeks because of this).
 *
 * Returns {success, queueId} on enqueue, {success:false, error} on render
 * failure, matching the {success, error} shape that direct sendTemplateEmail
 * callers (billing.js, contact.js) check today.
 *
 * @param {object} options
 * @param {string} options.to Recipient email
 * @param {string} options.subject Subject line
 * @param {Function} options.template React Email component (already loaded)
 * @param {object} options.templateProps Props passed to the template
 * @param {Array<string>} options.categories Resend tags (forwarded by worker)
 * @param {string} options.type Discriminator stored on EmailQueue.type
 * @param {number} options.priority EmailPriority enum value (default NORMAL)
 * @param {string} options.organizationId Tenant id (required for tracking)
 * @param {string} options.userId Optional sender-target user id
 * @param {Date} options.scheduledFor Defer until this time (default now)
 * @param {number} options.maxAttempts Retry budget (default 3)
 */
export async function enqueueTemplateEmail({
  to,
  subject,
  template,
  templateProps = {},
  categories = [],
  replyTo = null,
  type,
  priority = EmailPriority.NORMAL,
  organizationId,
  userId,
  scheduledFor = new Date(),
  maxAttempts = 3,
}) {
  if (!type) {
    return { success: false, error: "enqueueTemplateEmail: type is required" };
  }

  let html;
  let text;
  try {
    const rendered = await renderEmail(template, templateProps);
    html = rendered.html;
    text = rendered.text;
  } catch (renderError) {
    logger.error("[EmailQueue] Template render failed during enqueue:", {
      type,
      organizationId,
      error: renderError.message,
    });
    return { success: false, error: `render failed: ${renderError.message}` };
  }

  try {
    const queued = await enqueueEmail({
      userId,
      organizationId,
      type,
      to,
      subject,
      data: { html, text, categories, replyTo },
      priority,
      scheduledFor,
      maxAttempts,
    });
    return { success: true, queueId: queued.id };
  } catch (enqueueError) {
    logger.error("[EmailQueue] Enqueue failed:", {
      type,
      organizationId,
      to,
      error: enqueueError.message,
    });
    return { success: false, error: enqueueError.message };
  }
}

/**
 * Enqueue multiple emails in batch
 * @param {Array} emails Array of email options
 * @returns {Promise<Array<EmailQueue>>} Created queue entries
 */
export async function enqueueEmails(emails) {
  return EmailQueue.bulkCreate(
    emails.map((email) => ({
      ...email,
      status: "pending",
      priority: email.priority || EmailPriority.NORMAL,
      scheduledFor: email.scheduledFor || new Date(),
      maxAttempts: email.maxAttempts || 3,
    }))
  );
}

/**
 * Process the email queue.
 *
 * #744 / role-switch posture: the queue itself (EmailQueue table) is not
 * RLS-protected -- queue rows are platform-scope so the worker reads
 * across all tenants in one query, as before. But each row's downstream
 * work (User.findByPk for the recipient, opt-out preference checks, log
 * inserts on RLS-protected tables) MUST run with app.tenant_id matching
 * the row's tenant, or RLS denies every read once APP_DB_ROLE constrains
 * the worker. We resolve the tenant per row, then wrap the row's work in
 * withTenantContext(tenantId, ...) so SET LOCAL ROLE + SET LOCAL
 * app.tenant_id apply for the lifetime of that row's transaction.
 *
 * #745 / claim-then-process posture: pending rows are claimed inside a
 * short outer transaction with `SELECT FOR UPDATE SKIP LOCKED` and
 * immediately updated to status='sending' before commit, so concurrent
 * workers (Azure Container Apps replicas, manual admin triggers running
 * while the cron fires) see disjoint row sets. The lock is released
 * before the long-running per-row send loop, so a slow Resend call does
 * not stall other workers' claim attempts.
 *
 * Rows whose organizationId is missing or resolves to no active tenant
 * fail-closed: the row is marked failed with an explicit error rather
 * than silently sent under the wrong (or no) tenant context.
 *
 * @param {number} batchSize Number of emails to process
 * @returns {Promise<object>} Processing results
 */
export async function processQueue(batchSize = 50) {
  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    rateLimited: 0,
  };

  // Claim phase (#745): SELECT FOR UPDATE SKIP LOCKED + UPDATE to
  // 'sending' inside one short transaction. Concurrent workers see only
  // unlocked rows and end up with disjoint claims. Reads as the worker's
  // privileged role; EmailQueue has no RLS so this returns rows across
  // all tenants in one batch (the desired cron behaviour). The lock is
  // released on commit before the long-running per-row send loop runs.
  const emails = await EmailQueue.sequelize.transaction(async (tx) => {
    const rows = await EmailQueue.findAll({
      where: {
        status: "pending",
        scheduledFor: { [Op.lte]: new Date() },
      },
      order: [
        ["priority", "ASC"],
        ["scheduledFor", "ASC"],
      ],
      limit: batchSize,
      lock: tx.LOCK.UPDATE,
      skipLocked: true,
      transaction: tx,
    });

    if (rows.length > 0) {
      await EmailQueue.update(
        { status: "sending" },
        {
          where: { id: { [Op.in]: rows.map((r) => r.id) } },
          transaction: tx,
        }
      );
    }

    return rows;
  });

  for (const email of emails) {
    results.processed++;

    // Check rate limit
    if (!checkRateLimit()) {
      results.rateLimited++;
      continue;
    }

    // Resolve the tenant for this row up front. Without a tenant we
    // cannot safely run downstream queries on RLS-protected tables.
    if (!email.organizationId) {
      await email.update({ status: "failed", error: "Missing organizationId on queue row" });
      results.failed++;
      continue;
    }

    let tenant;
    try {
      tenant = await getTenantByOrganizationId(email.organizationId);
    } catch (err) {
      logger.error(`[Queue Processor] Failed to resolve tenant for ${email.organizationId}:`, err);
      await email.update({ status: "failed", error: `Tenant resolution failed: ${err.message}` });
      results.failed++;
      continue;
    }

    if (!tenant) {
      await email.update({
        status: "failed",
        error: `Tenant not found for organizationId: ${email.organizationId}`,
      });
      results.failed++;
      continue;
    }

    if (tenant.status !== "active") {
      await email.update({
        status: "failed",
        error: `Tenant not active (status: ${tenant.status})`,
      });
      results.failed++;
      continue;
    }

    // Wrap the row's work in a tenant-scoped, role-switched transaction
    // so RLS enforces inside (#744). The row was already moved to
    // 'sending' during the claim phase (#745), so this loop only handles
    // opt-out checks, the actual send, and the terminal status update
    // (sent or cancelled). If any step throws, the whole unit rolls back
    // and handleSendFailure runs outside the wrapper to record the
    // failure on the queue row in a fresh transaction.
    try {
      const sendResult = await withTenantContext(tenant.id, async () => {
        // Check user notification preferences (skip for critical emails).
        // Runs inside the wrapper so shouldSendNotification's User read
        // sees the right tenant.
        if (email.userId && email.priority > EmailPriority.CRITICAL) {
          const shouldSend = await shouldSendNotification(email.userId, email.type);
          if (!shouldSend) {
            await email.update({ status: "cancelled", error: "User opted out" });
            return { skipped: true };
          }
        }

        // Send the email (User.findByPk for recipient is RLS-protected)
        const result = await sendQueuedEmail(email);

        // Mark as sent
        await email.update({
          status: "sent",
          sentAt: new Date(),
          messageId: result.messageId,
        });

        // Log successful send
        await logEmail(email, "sent", result.messageId);

        return { sent: true, messageId: result.messageId };
      });

      if (sendResult.skipped) {
        results.skipped++;
      } else if (sendResult.sent) {
        results.sent++;
      }
    } catch (error) {
      await handleSendFailure(email, error);
      results.failed++;
    }
  }

  return results;
}

/**
 * Send a queued email
 * @param {EmailQueue} queueEntry Queue entry to send
 * @returns {Promise<object>} Send result with messageId
 */
async function sendQueuedEmail(queueEntry) {
  // Get recipient email
  let to = queueEntry.to;
  if (!to && queueEntry.userId) {
    const user = await User.findByPk(queueEntry.userId);
    to = user?.email;
  }

  if (!to) {
    throw new Error("No recipient email address");
  }

  // Send through email service
  // Queue stores pre-rendered HTML in data.html (produced at enqueue time
  // by enqueueTemplateEmail). data.categories carries the Resend tags so
  // per-org tracking survives the queue round-trip.
  const emailData = queueEntry.data || {};
  const result = await sendRawEmail({
    to,
    subject: queueEntry.subject,
    html: emailData.html || `<p>Email type: ${queueEntry.type}</p>`,
    text: emailData.text || queueEntry.subject,
    replyTo: emailData.replyTo || null,
    categories: emailData.categories || [],
  });

  // sendRawEmail returns {success: false, error} on Resend failures rather
  // than throwing. Surface that as a throw so handleSendFailure records it.
  if (!result.success) {
    throw new Error(result.error || "sendRawEmail returned success=false");
  }

  return result;
}

/**
 * Handle email send failure
 * @param {EmailQueue} email Queue entry that failed
 * @param {Error} error The error that occurred
 */
async function handleSendFailure(email, error) {
  const attempts = email.attempts + 1;
  const errorMessage = error.message || "Unknown error";

  // Determine if this is a permanent failure
  const permanentFailures = ["Invalid email", "No recipient", "User opted out", "Unsubscribed"];
  const isPermanent = permanentFailures.some((msg) =>
    errorMessage.toLowerCase().includes(msg.toLowerCase())
  );

  if (isPermanent || attempts >= email.maxAttempts) {
    // Mark as permanently failed
    await email.update({
      status: "failed",
      error: errorMessage,
      attempts,
    });
    await logEmail(email, "failed", null, errorMessage);
  } else {
    // Schedule retry with exponential backoff
    const nextRetry = email.getNextRetryTime();
    await email.update({
      status: "pending",
      error: errorMessage,
      attempts,
      scheduledFor: nextRetry,
    });
  }
}

/**
 * Log email send to EmailLog
 * @param {EmailQueue} email Queue entry
 * @param {string} status Status (sent, failed, etc.)
 * @param {string} messageId Optional message ID
 * @param {string} error Optional error message
 */
async function logEmail(email, status, messageId = null, error = null) {
  try {
    await EmailLog.create({
      userId: email.userId,
      organizationId: email.organizationId,
      type: email.type,
      to: email.to,
      subject: email.subject,
      status,
      messageId,
      sentAt: status === "sent" ? new Date() : null,
      error,
      metadata: {
        queueId: email.id,
        attempts: email.attempts,
        priority: email.priority,
      },
    });
  } catch (logError) {
    logger.error("[EmailQueue] Failed to log email:", logError);
  }
}

/**
 * Batch pending notifications into digest emails.
 *
 * #745 / claim-then-process: per-user notification claim + cancel runs
 * inside one transaction with FOR UPDATE SKIP LOCKED, so two concurrent
 * batchDigestEmails invocations (e.g. cron firing on two replicas) end
 * up with disjoint per-user notification sets. The second worker's
 * findAll inside the locked range sees zero rows and emits no digest;
 * no double-batching.
 *
 * @param {string} frequency Frequency type (hourly, daily, weekly)
 */
export async function batchDigestEmails(frequency) {
  // Get users who prefer this frequency. Aggregate is read-only and does
  // not need locking; concurrent workers may see overlapping userId sets,
  // but the per-user claim transaction below resolves the race.
  const pendingByUser = await EmailQueue.findAll({
    where: {
      status: "pending",
      type: { [Op.like]: "notification%" },
    },
    attributes: ["userId"],
    group: ["userId"],
  });

  for (const { userId } of pendingByUser) {
    if (!userId) continue;

    // Check user's email frequency preference
    const userFrequency = await getEmailFrequency(userId);
    if (userFrequency !== frequency) continue;

    // Claim phase (#745): SELECT FOR UPDATE SKIP LOCKED + UPDATE to
    // 'cancelled' + INSERT digest, all inside one transaction. A
    // concurrent worker's findAll on the same userId either blocks
    // (default isolation) or skips (given SKIP LOCKED) and ends up
    // with zero rows post-commit -- so only this worker emits the
    // digest for this batch of notifications. Putting the enqueue
    // inside the same tx makes the operation atomic: a partial failure
    // rolls back the cancel too, returning notifications to 'pending'
    // so the next batch run picks them up again. (Old, two-step order
    // could leak notifications-cancelled-but-no-digest on bad days.)
    await EmailQueue.sequelize.transaction(async (tx) => {
      const notifications = await EmailQueue.findAll({
        where: {
          userId,
          status: "pending",
          type: { [Op.like]: "notification%" },
        },
        lock: tx.LOCK.UPDATE,
        skipLocked: true,
        transaction: tx,
      });

      if (notifications.length === 0) return;

      // Cancel individual notifications inside the same tx so concurrent
      // workers see them as no-longer-pending after commit.
      await EmailQueue.update(
        { status: "cancelled", error: "Batched into digest" },
        {
          where: { id: notifications.map((n) => n.id) },
          transaction: tx,
        }
      );

      // Resolve recipient if missing (User.findByPk runs as the
      // privileged role on this tx -- batchDigestEmails is a cron path
      // that has not migrated to APP_DB_ROLE, see #752).
      let emailTo;
      if (userId) {
        const user = await User.findByPk(userId, { transaction: tx });
        if (user?.email) emailTo = user.email;
      }

      // Create digest email inside the same tx for atomicity.
      await EmailQueue.create(
        {
          userId,
          type: `digest-${frequency}`,
          to: emailTo,
          data: {
            notifications: notifications.map((n) => ({
              type: n.type,
              ...n.data,
            })),
            count: notifications.length,
          },
          priority: EmailPriority.BATCH,
          scheduledFor: new Date(),
          maxAttempts: 3,
          status: "pending",
        },
        { transaction: tx }
      );
    });
  }
}

/**
 * Retry a failed email
 * @param {string} emailId Email queue ID
 * @returns {Promise<EmailQueue>} Updated queue entry
 */
export async function retryEmail(emailId) {
  const email = await EmailQueue.findByPk(emailId);
  if (!email) {
    throw new Error("Email not found");
  }

  if (email.status !== "failed") {
    throw new Error("Can only retry failed emails");
  }

  await email.update({
    status: "pending",
    scheduledFor: new Date(),
    attempts: 0,
    error: null,
  });

  return email;
}

/**
 * Cancel a pending email
 * @param {string} emailId Email queue ID
 * @returns {Promise<EmailQueue>} Updated queue entry
 */
export async function cancelEmail(emailId) {
  const email = await EmailQueue.findByPk(emailId);
  if (!email) {
    throw new Error("Email not found");
  }

  if (email.status !== "pending") {
    throw new Error("Can only cancel pending emails");
  }

  await email.update({
    status: "cancelled",
    error: "Cancelled by admin",
  });

  return email;
}

/**
 * Get queue statistics
 * @param {string} organizationId Optional organization filter
 * @returns {Promise<object>} Queue statistics
 */
export async function getQueueStats(organizationId = null) {
  const where = organizationId ? { organizationId } : {};

  const [pending, sending, sent, failed, cancelled] = await Promise.all([
    EmailQueue.count({ where: { ...where, status: "pending" } }),
    EmailQueue.count({ where: { ...where, status: "sending" } }),
    EmailQueue.count({ where: { ...where, status: "sent" } }),
    EmailQueue.count({ where: { ...where, status: "failed" } }),
    EmailQueue.count({ where: { ...where, status: "cancelled" } }),
  ]);

  // Get oldest pending email
  const oldestPending = await EmailQueue.findOne({
    where: { ...where, status: "pending" },
    order: [["scheduledFor", "ASC"]],
    attributes: ["scheduledFor"],
  });

  // Get stats by type
  const byType = await EmailQueue.findAll({
    where: { ...where, status: "pending" },
    attributes: ["type", [EmailQueue.sequelize.fn("COUNT", "*"), "count"]],
    group: ["type"],
    raw: true,
  });

  return {
    pending,
    sending,
    sent,
    failed,
    cancelled,
    total: pending + sending + sent + failed + cancelled,
    oldestPending: oldestPending?.scheduledFor || null,
    byType: byType.reduce((acc, { type, count }) => {
      acc[type] = parseInt(count, 10);
      return acc;
    }, {}),
    rateLimit: getRateLimitStatus(),
  };
}

/**
 * Get email log statistics
 * @param {object} options Filter options
 * @returns {Promise<object>} Email statistics
 */
export async function getEmailStats({ organizationId, startDate, endDate, type } = {}) {
  const where = {};
  if (organizationId) where.organizationId = organizationId;
  if (type) where.type = type;
  if (startDate || endDate) {
    where.sentAt = {};
    if (startDate) where.sentAt[Op.gte] = startDate;
    if (endDate) where.sentAt[Op.lte] = endDate;
  }

  const [sent, delivered, bounced, opened, clicked, failed] = await Promise.all([
    EmailLog.count({ where: { ...where, status: "sent" } }),
    EmailLog.count({ where: { ...where, status: "delivered" } }),
    EmailLog.count({ where: { ...where, status: "bounced" } }),
    EmailLog.count({ where: { ...where, status: "opened" } }),
    EmailLog.count({ where: { ...where, status: "clicked" } }),
    EmailLog.count({ where: { ...where, status: "failed" } }),
  ]);

  const total = sent + delivered + bounced + failed;

  return {
    sent,
    delivered,
    bounced,
    opened,
    clicked,
    failed,
    total,
    deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(2) : 0,
    openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(2) : 0,
    clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) : 0,
    bounceRate: total > 0 ? ((bounced / total) * 100).toFixed(2) : 0,
  };
}

/**
 * Cleanup old queue entries
 * @param {number} daysToKeep Number of days to keep sent/failed entries
 * @returns {Promise<number>} Number of entries deleted
 */
// #822: on worker startup, reset any rows stuck in 'sending' back to 'pending'
// so they are retried on the next cron tick. Safe to run unconditionally on boot
// because there is no active worker during startup that could be mid-send.
export async function recoverStuckSending() {
  const [count] = await EmailQueue.update(
    { status: "pending", attempts: 0 },
    { where: { status: "sending" } }
  );
  if (count > 0) {
    logger.warn(`[EmailQueue] Recovered ${count} stuck 'sending' row(s) on startup`);
  }
  return count;
}

export async function cleanupOldEntries(daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await EmailQueue.destroy({
    where: {
      status: { [Op.in]: ["sent", "failed", "cancelled"] },
      updatedAt: { [Op.lt]: cutoffDate },
    },
  });

  logger.info(`[EmailQueue] Cleaned up ${result} old entries`);
  return result;
}

/**
 * Monitor queue health
 * @returns {Promise<object>} Health status
 */
export async function monitorQueueHealth() {
  const stats = await getQueueStats();

  const health = {
    status: "healthy",
    issues: [],
    stats,
  };

  // Check for queue backup
  if (stats.pending > 1000) {
    health.status = "warning";
    health.issues.push(`High queue depth: ${stats.pending} pending emails`);
  }

  // Check for stale emails
  if (stats.oldestPending) {
    const ageHours = (Date.now() - new Date(stats.oldestPending).getTime()) / (1000 * 60 * 60);
    if (ageHours > 24) {
      health.status = "warning";
      health.issues.push(`Stale emails: oldest is ${ageHours.toFixed(1)} hours old`);
    }
  }

  // Check failure rate
  const failureRate = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;
  if (failureRate > 10) {
    health.status = "critical";
    health.issues.push(`High failure rate: ${failureRate.toFixed(1)}%`);
  }

  // Check rate limit
  if (stats.rateLimit.remaining < 100) {
    health.status = "warning";
    health.issues.push(`Rate limit low: ${stats.rateLimit.remaining} remaining`);
  }

  return health;
}

export default {
  EmailPriority,
  enqueueEmail,
  enqueueTemplateEmail,
  enqueueEmails,
  processQueue,
  batchDigestEmails,
  retryEmail,
  cancelEmail,
  getQueueStats,
  getEmailStats,
  cleanupOldEntries,
  recoverStuckSending,
  monitorQueueHealth,
  getRateLimitStatus,
};
