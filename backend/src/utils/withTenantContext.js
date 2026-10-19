// Issue #740 / #744: tenant-context helper for non-request code paths.
//
// Routes get tenant-local app.tenant_id from wrapTenantTransaction (registered
// globally on /api in index.js). Cron jobs, services iterating across
// tenants, and any other non-Express code path need the equivalent: an open
// transaction with SET LOCAL app.tenant_id = :tid so RLS policies enforce.
//
// Mirrors wrapTenantTransaction's role-switch posture (#744): when the
// APP_DB_ROLE env var is set (production-style deployments point it at
// `br360_app_user`), the wrapper also runs `SET LOCAL ROLE :role` so the
// callback executes as the constrained NOSUPERUSER NOBYPASSRLS role and RLS
// actually enforces. When APP_DB_ROLE is unset (local dev where the role
// may not exist), the role switch is skipped and the privileged role's
// BYPASSRLS keeps cron-style code working as before -- but app.tenant_id
// is still set so RLS-checking tests can opt in via NOSUPERUSER NOBYPASSRLS
// fixtures (see testing/test-fixtures/postgres-rls-fixture.js).
//
// Without this, dropping BYPASSRLS on the runtime role causes silent data
// loss in cron-driven services (digest emails, engagement, queue workers):
// queries on RLS-protected tables (Users, Ideas, Comments, Votes,
// CommentVotes, Categories) return zero rows when app.tenant_id is unset,
// because the policy `tenant_id::text = current_setting('app.tenant_id', true)`
// evaluates against NULL.
//
// Usage:
//   import { withTenantContext } from "../utils/withTenantContext.js";
//   await withTenantContext(tenantId, async () => {
//     const users = await User.findAll({ where: { organizationId } });
//     // ... per-tenant work
//   });
//
// The callback receives no arguments. Sequelize CLS (enabled in
// models/database.js) threads the transaction to every nested model call
// automatically, mirroring wrapTenantTransaction's request-path contract.

import { sequelize } from "../models/database.js";
import { QueryTypes } from "sequelize";

const APP_DB_ROLE = process.env.APP_DB_ROLE || null;

export async function withTenantContext(tenantId, fn) {
  if (!tenantId) {
    throw new Error(
      "withTenantContext: tenantId is required (RLS policy filters against NULL otherwise)"
    );
  }

  return sequelize.transaction(async (t) => {
    if (APP_DB_ROLE) {
      // Switch to the constrained role so RLS applies for this work unit.
      // Identifier interpolated as a literal because role names cannot be
      // bound parameters; APP_DB_ROLE comes from env and is validated
      // implicitly via SET ROLE failing fast on a bad name.
      await sequelize.query(`SET LOCAL ROLE "${APP_DB_ROLE}"`, {
        transaction: t,
        type: QueryTypes.RAW,
      });
    }
    await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
      replacements: { tid: tenantId },
      transaction: t,
      type: QueryTypes.RAW,
    });
    return fn();
  });
}
