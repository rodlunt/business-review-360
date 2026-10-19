// Request-level tenant transaction wrapper -- issue #561 (folds #480) +
// issue #740 (role-switch to enforce RLS without dropping cron-job privileges).
//
// Runs after resolveTenant on /api globally. Opens a Sequelize-managed
// transaction, switches the current role to the constrained APP_DB_ROLE
// (which has NOSUPERUSER NOBYPASSRLS so RLS enforces), executes
// SET LOCAL app.tenant_id = :tid, attaches the transaction to
// req.transaction, and holds it open until the response completes.
// Sequelize CLS (enabled in models/database.js) threads the transaction
// to every nested model call, so handlers do not need to pass it.
//
// Why SET LOCAL ROLE: the prod runtime user has SUPERUSER+BYPASSRLS so
// cron services iterating across tenants keep working without per-loop
// SET app.tenant_id. Routes need RLS enforced, so the wrapper drops down
// to a constrained role for the request transaction's lifetime. SET LOCAL
// ROLE reverts on commit/rollback, so the next pool reuse starts fresh
// as the privileged role.
//
// APP_DB_ROLE env var defaults to "br360_app_user". Skip the role switch
// when APP_DB_ROLE is unset (local dev where the role may not exist).
//
// Commit / rollback policy (spec section 7):
//   - res.statusCode  < 500 on finish  -> resolve -> commit
//   - res.statusCode >= 500 on finish  -> reject  -> rollback
//   - res.close before res.finish      -> reject  -> rollback (client disconnect)
//
// Spec: docs/superpowers/specs/2026-04-29-561-tenant-tx-wrapper-design.md (s.6)
// Plan: docs/superpowers/plans/2026-04-29-561-tenant-tx-wrapper-plan.md
import { sequelize } from "../models/database.js";
import { QueryTypes } from "sequelize";
import { logger } from "../utils/logger.js";

const APP_DB_ROLE = process.env.APP_DB_ROLE || null;

export const wrapTenantTransaction = (req, res, next) => {
  if (!req.tenant) {
    // Routes without tenant context (eg health checks, unauth flows) skip.
    return next();
  }

  sequelize
    .transaction(async (t) => {
      if (APP_DB_ROLE) {
        // Switch to the constrained role so RLS applies for this request.
        // Identifier interpolated as a literal because role names cannot be
        // bound parameters; APP_DB_ROLE comes from env and is validated at
        // boot via SET ROLE itself failing fast on a bad name.
        await sequelize.query(`SET LOCAL ROLE "${APP_DB_ROLE}"`, {
          transaction: t,
          type: QueryTypes.RAW,
        });
      }
      await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
        replacements: { tid: req.tenant.id },
        transaction: t,
        type: QueryTypes.RAW,
      });
      req.transaction = t;

      await new Promise((resolve, reject) => {
        // settled flag: once either event fires, the second is a no-op.
        // res.once auto-removes each listener after first invocation; the
        // flag prevents the remaining once-listener from double-settling.
        let settled = false;
        const settle = (fn, ...args) => {
          if (settled) return;
          settled = true;
          fn(...args);
        };
        const onFinish = () => {
          if (res.statusCode >= 500) {
            settle(reject, new Error(`Request failed with status ${res.statusCode}`));
          } else {
            settle(resolve);
          }
        };
        const onClose = () => {
          if (!res.writableEnded) {
            settle(reject, new Error("Client disconnected before response completion"));
          } else {
            // res.end() was called but finish hasn't fired yet; client closed
            // before flush completed. Treat as success to avoid hanging the
            // transaction (and leaking the pool connection) indefinitely.
            settle(resolve);
          }
        };
        res.once("finish", onFinish);
        res.once("close", onClose);

        next();
      });
    })
    .catch((err) => {
      if (!res.headersSent) {
        next(err);
      } else {
        logger.error("wrapTenantTransaction: transaction rolled back after headers sent", {
          error: err.message,
          path: req.path,
        });
      }
    });
};
