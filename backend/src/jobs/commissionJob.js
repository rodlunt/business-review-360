/**
 * Commission Job (#808 Phase 3)
 *
 * Runs on the 1st of each month at 8:00 AM (COMMISSION_TIMEZONE or
 * Australia/Melbourne). For each active Consultant:
 *
 *   - Finds all Organisations where referredBy = consultant.referralCode.
 *   - Looks up active Stripe subscriptions for each such org.
 *   - Calculates commission = floor(latestInvoiceAmountCents * commissionRate).
 *   - Creates one CommissionRun row per consultant.
 *   - Emails the consultant a monthly statement via the queue.
 *
 * Stripe is optional: if STRIPE_SECRET_KEY is absent the job logs a warning
 * and exits cleanly without touching the DB.
 *
 * Individual Stripe errors per-org are caught and logged; one bad org never
 * aborts the whole run.
 */

import cron from "node-cron";
import Stripe from "stripe";
import Consultant from "../models/Consultant.js";
import Organization from "../models/Organization.js";
import CommissionRun from "../models/CommissionRun.js";
import { enqueueTemplateEmail, EmailPriority } from "../services/emailQueueService.js";
import { ConsultantMonthlyStatementEmail } from "../emails/templates/consultants/ConsultantMonthlyStatementEmail.jsx";
import { logger } from "../utils/logger.js";
import { notifyError } from "../utils/ntfy.js";

const jobs = { commissionRunner: null };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as "May 2026" (Australian English month names).
 */
function monthLabel(date) {
  return date.toLocaleString("en-AU", { month: "long", year: "numeric" });
}

/**
 * Return the first day of last month and the last day of last month (midnight
 * UTC boundaries) relative to `now`.
 */
function lastMonthBounds(now) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end };
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function runCommissionJob({ triggeredBy = "cron" } = {}) {
  logger.info("[CommissionJob] Starting monthly commission run...");

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    logger.warn("[CommissionJob] STRIPE_SECRET_KEY is not configured. Skipping commission run.");
    return;
  }

  const stripe = new Stripe(stripeKey);

  const now = new Date();
  const { start: periodStart, end: periodEnd } = lastMonthBounds(now);
  const label = monthLabel(periodStart);

  logger.info(`[CommissionJob] Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

  let consultantsProcessed = 0;
  let consultantsFailed = 0;
  let totalOrgStripeErrors = 0;

  try {
    const consultants = await Consultant.findAll({ where: { isActive: true } });
    logger.info(`[CommissionJob] Found ${consultants.length} active consultant(s)`);

    for (const consultant of consultants) {
      try {
        const r = await processConsultant({
          consultant,
          stripe,
          periodStart,
          periodEnd,
          label,
          triggeredBy,
        });
        totalOrgStripeErrors += r?.orgStripeErrors || 0;
        consultantsProcessed++;
      } catch (err) {
        consultantsFailed++;
        logger.error(`[CommissionJob] Error processing consultant ${consultant.id}:`, err);
      }
    }

    logger.info(
      `[CommissionJob] Run complete. Processed: ${consultantsProcessed}, Failed: ${consultantsFailed}`
    );

    // #815: a run that "completes" while consultants were skipped or while
    // per-org Stripe lookups failed produces a plausible-but-wrong
    // CommissionRun -- consultants are silently underpaid and only a log
    // line records it. This is the #735 incident class with money as the
    // artefact. Surface it on the existing ntfy channel. notifyError is
    // rate-limited internally and this cron runs monthly, so there is no
    // spam risk.
    if (consultantsFailed > 0 || totalOrgStripeErrors > 0) {
      notifyError(
        "[BR360] Commission run completed with errors",
        `Commission run for ${label} finished but is incomplete -- consultants may be underpaid.\n` +
          `Consultants failed: ${consultantsFailed}. Org-level Stripe errors: ${totalOrgStripeErrors}.`,
        { priority: 4 }
      ).catch(() => {});
    }
  } catch (err) {
    logger.error("[CommissionJob] Fatal error during commission run:", err);
    // The entire monthly run aborted. No statements went out and no
    // commissions were recorded. Always alert (priority 5).
    notifyError(
      "[BR360] Commission run FAILED",
      `Commission run for ${label} aborted: ${err.message}\n\n${
        err.stack ? err.stack.slice(0, 800) : "(no stack)"
      }`,
      { priority: 5 }
    ).catch(() => {});
  }
}

async function processConsultant({
  consultant,
  stripe,
  periodStart,
  periodEnd,
  label,
  triggeredBy,
}) {
  const log = logger;

  // One CommissionRun per consultant per period (#928). A cron double-fire,
  // a retry after a partial failure, or a manual trigger in the same month
  // must not produce a second run row or a second statement email. The DB
  // unique constraint (0025) is the backstop; this check makes the re-run
  // a clean skip instead of a per-consultant failure alert.
  const existingRun = await CommissionRun.findOne({
    where: { consultantId: consultant.id, periodStart },
  });
  if (existingRun) {
    log.info(
      `[CommissionJob] Consultant ${consultant.id} already has run ${existingRun.id} ` +
        `for period starting ${periodStart.toISOString()}; skipping`
    );
    return { orgStripeErrors: 0, skipped: true };
  }

  // Find all orgs referred by this consultant.
  const orgs = await Organization.findAll({
    where: { referredBy: consultant.referralCode },
    attributes: ["id", "organizationId", "organizationName"],
  });

  log.info(
    `[CommissionJob] Consultant ${consultant.id} (${consultant.referralCode}): ` +
      `${orgs.length} referred org(s)`
  );

  const lineItems = [];
  let totalGrossCents = 0;
  let orgStripeErrors = 0;

  for (const org of orgs) {
    try {
      const orgGross = await fetchActiveSubscriptionAmount(stripe, org);
      if (orgGross === 0) continue;

      const commissionCents = Math.floor(orgGross * Number(consultant.commissionRate));
      totalGrossCents += orgGross;
      lineItems.push({
        orgName: org.organizationName,
        grossCents: orgGross,
        commissionCents,
      });
    } catch (err) {
      orgStripeErrors++;
      log.error(`[CommissionJob] Stripe error for org ${org.organizationId}:`, {
        message: err.message,
      });
      // Continue with the remaining orgs. The caller aggregates
      // orgStripeErrors and alerts post-run (#815) so a silently
      // underpaid run is not invisible.
    }
  }

  const totalCommissionCents = lineItems.reduce((sum, li) => sum + li.commissionCents, 0);

  // Write the CommissionRun record. A unique-constraint violation here means
  // a concurrent run (cron racing a manual trigger) claimed this period
  // between our check above and this insert; treat it as the same clean skip.
  let run;
  try {
    run = await CommissionRun.create({
      consultantId: consultant.id,
      periodStart,
      periodEnd,
      orgCount: lineItems.length,
      totalGrossCents,
      totalCommissionCents,
      currency: "aud",
      runAt: new Date(),
      triggeredBy,
      emailSent: false,
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      log.info(
        `[CommissionJob] Concurrent run already recorded consultant ${consultant.id} ` +
          `for period starting ${periodStart.toISOString()}; skipping`
      );
      return { orgStripeErrors, skipped: true };
    }
    throw err;
  }

  log.info(
    `[CommissionJob] CommissionRun ${run.id} created for consultant ${consultant.id}: ` +
      `${lineItems.length} orgs, ${totalCommissionCents} cents commission`
  );

  // Email the consultant.
  // We need their email. The Consultant model links to a User via userId.
  // If userId is null the consultant hasn't created a BR360 account yet;
  // we can't send them an email, so skip gracefully.
  if (!consultant.userId) {
    log.info(`[CommissionJob] Consultant ${consultant.id} has no userId; skipping statement email`);
    return { orgStripeErrors };
  }

  // Dynamically import User to avoid a circular dep at module load time.
  const { default: User } = await import("../models/User.js");
  const user = await User.findOne({ where: { id: consultant.userId } });

  if (!user || !user.email) {
    log.warn(
      `[CommissionJob] No email address found for consultant userId ${consultant.userId}; skipping email`
    );
    return { orgStripeErrors };
  }

  const result = await enqueueTemplateEmail({
    to: user.email,
    subject: `Your BR360 commission statement for ${label}`,
    template: ConsultantMonthlyStatementEmail,
    templateProps: {
      firstName: consultant.firstName,
      monthLabel: label,
      lineItems,
      totalCommissionCents,
      currency: "AUD",
    },
    type: "consultant_monthly_statement",
    priority: EmailPriority.NORMAL,
    organizationId: null,
    userId: user.id,
  });

  if (result.success) {
    await run.update({ emailSent: true, emailSentAt: new Date() });
    log.info(`[CommissionJob] Statement email queued for ${user.email}`);
  } else {
    log.error(`[CommissionJob] Failed to queue statement email for ${user.email}:`, result.error);
  }

  return { orgStripeErrors };
}

/**
 * Sum the latest invoice amounts for all active subscriptions tied to an org.
 *
 * Returns gross amount in cents (AUD or whatever currency Stripe returns).
 * Returns 0 if the org has no active subscriptions or no stripeCustomerId
 * equivalent stored. Because BR360's Organization model tracks referredBy but
 * not a stripeCustomerId column directly, we query the platform tenants table.
 */
async function fetchActiveSubscriptionAmount(stripe, org) {
  // The BR360 platform database (tenants table) holds the Stripe customer link
  // for each org. Rather than coupling the cron to the platform DB directly we
  // query via the platformSequelize helper used elsewhere in the codebase.
  const { platformSequelize } = await import("../models/platformDatabase.js");
  const { QueryTypes } = await import("sequelize");

  const rows = await platformSequelize.query(
    `SELECT stripe_customer_id FROM tenants WHERE org_id = :orgId LIMIT 1`,
    { replacements: { orgId: org.organizationId }, type: QueryTypes.SELECT }
  );

  if (!rows.length || !rows[0].stripe_customer_id) {
    return 0;
  }

  const customerId = rows[0].stripe_customer_id;

  // List active subscriptions for this customer.
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 10,
  });

  let total = 0;
  for (const sub of subs.data) {
    // Prefer the latest_invoice amount if available (the actual charged amount).
    if (sub.latest_invoice && typeof sub.latest_invoice === "object") {
      total += sub.latest_invoice.amount_paid || 0;
    } else {
      // Fall back to the unit_amount from the first price item.
      const item = sub.items?.data?.[0];
      if (item?.price?.unit_amount) {
        total += item.price.unit_amount;
      }
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// Cron registration
// ---------------------------------------------------------------------------

/**
 * Register the commission cron with node-cron.
 * Call this from startServer() in index.js.
 */
export function initializeCommissionJob() {
  const timezone = process.env.COMMISSION_TIMEZONE || "Australia/Melbourne";
  // Run at 8:00 AM on the 1st of every month.
  const schedule = process.env.COMMISSION_CRON || "0 8 1 * *";

  logger.info(
    `[CommissionJob] Scheduling commission cron: '${schedule}' in timezone '${timezone}'`
  );

  jobs.commissionRunner = cron.schedule(
    schedule,
    async () => {
      logger.info("[CommissionJob] Cron triggered");
      await runCommissionJob({ triggeredBy: "cron" });
    },
    { timezone }
  );
}

export function stopCommissionJob() {
  jobs.commissionRunner?.stop();
}
