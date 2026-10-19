/**
 * Trial Reminder Job (#531)
 *
 * Runs daily at 9am (configured timezone).
 *
 * For each tenant with plan='trial' and status='trial':
 *   - Flips status to 'trial_expired' and sends TrialExpired email when trial_ends_at < NOW().
 *   - Sends TrialReminder emails at 13, 7, 3, and 1 day(s) before expiry.
 *
 * Each reminder fires once per day. The daily granularity of the cron means
 * a reminder at N days remaining only fires on the day when days_remaining
 * rounds to N -- no deduplication table needed.
 */

import { platformSequelize } from "../models/platformDatabase.js";
import { QueryTypes } from "sequelize";
import User from "../models/User.js";
import { enqueueTemplateEmail, EmailPriority } from "../services/emailQueueService.js";
import { TrialReminder } from "../emails/templates/notifications/TrialReminder.jsx";
import { TrialExpired } from "../emails/templates/notifications/TrialExpired.jsx";
import { clearTenantCacheEntry } from "../middleware/tenantResolver.js";
import { logger } from "../utils/logger.js";

const REMINDER_DAYS = [13, 7, 3, 1];
const APP_URL = process.env.FRONTEND_URL || "https://br360.example.com";

export async function runTrialReminderJob() {
  logger.info("[TrialReminder] Starting trial reminder job...");

  let expired = 0;
  let reminded = 0;

  try {
    const trials = await platformSequelize.query(
      `SELECT id, org_id, tenant_name, trial_ends_at
       FROM tenants
       WHERE plan = 'trial' AND status = 'trial'`,
      { type: QueryTypes.SELECT }
    );

    logger.info(`[TrialReminder] Found ${trials.length} active trial tenant(s)`);

    for (const tenant of trials) {
      try {
        await processTrial(tenant);
      } catch (err) {
        logger.error(`[TrialReminder] Error processing tenant ${tenant.org_id}:`, err);
      }
    }

    logger.info(`[TrialReminder] Job complete. Expired: ${expired}, Reminded: ${reminded}`);
  } catch (err) {
    logger.error("[TrialReminder] Job failed:", err);
  }

  async function processTrial(tenant) {
    const now = new Date();
    const trialEnd = new Date(tenant.trial_ends_at);
    const msRemaining = trialEnd - now;
    const daysRemaining = Math.ceil(msRemaining / 86_400_000);

    const admins = await User.findAll({
      where: { organizationId: tenant.org_id, isAdmin: true },
    });

    if (msRemaining <= 0) {
      await expireTenant(tenant, admins);
      expired++;
      return;
    }

    if (REMINDER_DAYS.includes(daysRemaining)) {
      await sendReminders(tenant, admins, daysRemaining);
      reminded++;
    }
  }

  async function expireTenant(tenant, admins) {
    await platformSequelize.query(
      `UPDATE tenants SET status = 'trial_expired', updated_at = NOW()
       WHERE id = :id AND status = 'trial'`,
      { replacements: { id: tenant.id }, type: QueryTypes.UPDATE }
    );

    clearTenantCacheEntry(tenant.org_id);

    logger.info(`[TrialReminder] Expired tenant: ${tenant.org_id}`);

    for (const admin of admins) {
      if (!admin.email) continue;
      const result = await enqueueTemplateEmail({
        to: admin.email,
        subject: "Your Business Review 360 trial has ended",
        template: TrialExpired,
        templateProps: {
          adminName: admin.username,
          organizationId: tenant.org_id,
          organizationName: tenant.tenant_name,
          appUrl: APP_URL,
        },
        type: "trial_expired",
        priority: EmailPriority.HIGH,
        organizationId: tenant.org_id,
        userId: admin.id,
      });

      if (!result.success) {
        logger.error(
          `[TrialReminder] Failed to queue TrialExpired for ${admin.email}:`,
          result.error
        );
      }
    }
  }

  async function sendReminders(tenant, admins, daysRemaining) {
    logger.info(`[TrialReminder] Sending ${daysRemaining}-day reminder for ${tenant.org_id}`);

    for (const admin of admins) {
      if (!admin.email) continue;
      const result = await enqueueTemplateEmail({
        to: admin.email,
        subject: `Your Business Review 360 trial expires in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`,
        template: TrialReminder,
        templateProps: {
          adminName: admin.username,
          organizationId: tenant.org_id,
          organizationName: tenant.tenant_name,
          daysRemaining,
          trialEndsAt: tenant.trial_ends_at,
          appUrl: APP_URL,
        },
        type: `trial_reminder_${daysRemaining}d`,
        priority: daysRemaining <= 3 ? EmailPriority.HIGH : EmailPriority.NORMAL,
        organizationId: tenant.org_id,
        userId: admin.id,
      });

      if (!result.success) {
        logger.error(`[TrialReminder] Failed to queue reminder for ${admin.email}:`, result.error);
      }
    }
  }
}
