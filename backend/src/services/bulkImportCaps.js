// Bulk Staff Import Caps
// Issue #865: Hard safety caps for the bulk staff-list import.
//
// These are the LOAD-BEARING safeguards for the shared Resend account quota
// (#735 incident class). They run independently of plan gating in
// `middleware/planLimits.js#requireBulkInvitePlan`; that gate is packaging,
// these caps are safety. Both must hold before a bulk import is allowed to
// enqueue.
//
// Env knobs (all read at module load):
//   BULK_IMPORT_MAX_PER_IMPORT       max rows in a single CSV (default 1000)
//   BULK_IMPORT_MAX_PER_ORG_30D      max users created per org in last 30d (default 2000)
//   EMAIL_BULK_RESERVE_FRACTION      fraction of EMAIL_QUEUE_RATE_LIMIT held
//                                    back for non-bulk traffic so bulk imports
//                                    cannot starve password-reset / billing /
//                                    auth email (default 0.5 - bulk gets 50%)
//   EMAIL_QUEUE_RATE_LIMIT           per-hour cap (default 1000, matches
//                                    emailQueueService.js)
//
// All values are env-configurable. Defaults match decisions LOCKED 2026-05-19.

import { Op } from "sequelize";
import User from "../models/User.js";
import { ForbiddenError } from "./errors.js";

export const BULK_IMPORT_MAX_PER_IMPORT = parseInt(
  process.env.BULK_IMPORT_MAX_PER_IMPORT || "1000",
  10
);
export const BULK_IMPORT_MAX_PER_ORG_30D = parseInt(
  process.env.BULK_IMPORT_MAX_PER_ORG_30D || "2000",
  10
);
export const EMAIL_BULK_RESERVE_FRACTION = parseFloat(
  process.env.EMAIL_BULK_RESERVE_FRACTION || "0.5"
);
export const EMAIL_QUEUE_RATE_LIMIT = parseInt(process.env.EMAIL_QUEUE_RATE_LIMIT || "1000", 10);

/**
 * BATCH-priority emails per hour the queue is allowed to send from bulk
 * imports, after the reserve is held back. Used by `bulkImportFromCsv` to
 * stagger `scheduledFor` so a single import never bursts past this rate
 * (defensive in case the queue worker's reservation logic regresses).
 */
export const BULK_BATCH_PER_HOUR = Math.max(
  1,
  Math.floor((1 - EMAIL_BULK_RESERVE_FRACTION) * EMAIL_QUEUE_RATE_LIMIT)
);

/**
 * Throw if the requested batch would breach either of the per-org caps.
 * Conservative on the 30d count: counts ALL users created in the org window,
 * not just prior bulk-imported ones, because single-user creates also enqueue
 * activation emails and consume the same shared Resend budget. Over-counts
 * are safer than under-counts for a quota guard.
 *
 * @param {object} args
 * @param {string} args.organizationId    org slug or UUID (matches the User.organizationId column)
 * @param {number} args.requestedCount    number of valid rows about to be processed
 * @throws {ForbiddenError} code BULK_IMPORT_CAP_EXCEEDED with `cap` + counts
 */
export async function assertBulkImportWithinCaps({ organizationId, requestedCount }) {
  if (!organizationId) {
    throw new ForbiddenError("Organisation context required for bulk import", {
      code: "TENANT_REQUIRED",
    });
  }

  if (requestedCount > BULK_IMPORT_MAX_PER_IMPORT) {
    throw new ForbiddenError(
      `Bulk import too large: ${requestedCount} rows exceeds the ${BULK_IMPORT_MAX_PER_IMPORT} per-import cap`,
      {
        code: "BULK_IMPORT_CAP_EXCEEDED",
        details: {
          cap: "perImport",
          requested: requestedCount,
          max: BULK_IMPORT_MAX_PER_IMPORT,
        },
      }
    );
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // ORM call (not raw SQL) so this works on both production Postgres and the
  // SQLite-in-memory test harness. Follows whatever `sequelize` instance is
  // bound to User (test harnesses rebind via `User.init({...}, { sequelize })`).
  const recentCount = await User.count({
    where: { organizationId, createdAt: { [Op.gte]: thirtyDaysAgo } },
  });

  if (recentCount + requestedCount > BULK_IMPORT_MAX_PER_ORG_30D) {
    throw new ForbiddenError(
      `Bulk import would exceed 30-day org cap: ${recentCount} existing + ${requestedCount} requested > ${BULK_IMPORT_MAX_PER_ORG_30D} (env BULK_IMPORT_MAX_PER_ORG_30D)`,
      {
        code: "BULK_IMPORT_CAP_EXCEEDED",
        details: {
          cap: "perOrg30d",
          existing: recentCount,
          requested: requestedCount,
          max: BULK_IMPORT_MAX_PER_ORG_30D,
        },
      }
    );
  }
}

/**
 * Compute the `scheduledFor` for the Nth bulk-imported user, staggering so no
 * hour ever receives more than BULK_BATCH_PER_HOUR invites from a single
 * import. Defensive against any future regression in queue-worker pacing.
 *
 * @param {number} index   zero-based position of the user in the batch
 * @param {Date}   [now]   base time (defaults to current time; injectable for tests)
 * @returns {Date}
 */
export function scheduledForBulkInvite(index, now = new Date()) {
  const hourOffset = Math.floor(index / BULK_BATCH_PER_HOUR);
  return new Date(now.getTime() + hourOffset * 60 * 60 * 1000);
}
