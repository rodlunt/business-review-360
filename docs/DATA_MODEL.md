# Data Model

**The canonical schema is `db/migrations/app/`, applied in filename order.**
This file is deliberately a pointer, not a copy.

The prose-and-tables document that used to live here described the schema as
of October 2025 and went silently stale: it predated multi-tenancy entirely
(no `tenant_id`, no RLS, no `UserOrganizationMemberships`, `Consultants`,
`UserSessions` or `LoginThrottle`) while presenting itself as the data-model
reference. A confidently wrong schema document is worse than none, so it was
removed rather than patched (audit finding #931, 2026-08-18). The old content
is in git history if ever needed: `git log -- docs/DATA_MODEL.md`.

## Where to look instead

- **Authoritative schema**: `db/migrations/app/0001-baseline.sql` plus every
  later migration, in order. `docs/MIGRATIONS.md` explains the runner.
- **Current live shape, on demand**: against a migrated database,
  `pg_dump --schema-only` (or `\d+ "TableName"` in psql) is always true and
  costs nothing to regenerate.
- **Runtime interface**: the Sequelize models in `backend/src/models/`,
  which must stay in sync with the migrations (drift is checked by
  `schemaDrift.test.js` / `syncModelsComplete.test.js`).
- **Platform database** (`br360_platform`: tenants, pricing, Stripe
  bookkeeping): `db/platform-schema.sql` and
  `docs/CONTROL_PLANE_DATABASE.md`.
- **Tenancy and RLS design**: `docs/ops-rls.md` and
  `docs/TENANT_RESOLVER.md`.
