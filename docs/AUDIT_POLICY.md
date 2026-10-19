# BR360 audit logging policy

Purpose: forensic incident response. Compliance-grade coverage (SOC2,
ISO27001) is tracked separately and is not the bar this policy meets.

## Audited routers (in scope today)

`auditLogger` is mounted per-route inside each routes file. The mount
sits BEFORE any validators or auth middleware so validation-failure
responses are still captured.

| Router | Audited / Total | Notes |
|--------|-----------------|-------|
| /api/auth                  | 5 / 6 | GET /me unaudited (self-service read) |
| /api/billing               | 4 / 5 | GET /plans unaudited (public list)    |
| /api/users                 | 7 / 8 | GET /profile unaudited (self-service) |
| /api/audit                 | 3 / 3 | all admin reads                       |
| /api/admin/email-queue     | 11 / 11 | all admin                           |
| /api/admin/email-analytics | 9 / 9 | all admin                             |
| /api/settings              | 2 / 4 | mutations only (logAuditEvent + diff); GETs are public or self-service |
| /api/profanity-settings    | 3 / 3 | 1 admin read (mount), 1 mutation (logAuditEvent + diff), 1 admin test (mount) |
| /api/categories            | 3 / 4 | mutations only (logAuditEvent + diff); GET is self-service list |
| /api/setup                 | 2 / 5 | mutations only; pre-auth setup probes are not audited |

Action names follow the `<resource>.<action>` convention with kebab-case
for multi-word components. Examples: `auth.login`,
`auth.password-reset.request`, `user.role-change`, `audit.logs.view`,
`email-queue.entry.retry`. The full 39-endpoint catalogue lives in
`docs/superpowers/specs/2026-04-25-surgical-action-names-design.md`
and is the source of truth alongside the per-route `auditLogger`
mounts in each `backend/src/routes/*.js` file.

Three GET endpoints are deliberately not audited: `/api/auth/me`,
`/api/billing/plans`, `/api/users/profile`. These are self-service
reads with no forensic value; mutating endpoints and admin reads
remain audited. Per-endpoint precision is also available via
`metadata.path` and `metadata.statusCode`, populated by the middleware.

Mutating handlers in the config routes (settings, profanity-settings,
categories, setup) use `logAuditEvent({changes: {before, after}, ...})`
rather than the per-route `auditLogger` middleware. The handler captures
the pre-mutation row state via `Model.findByPk(...)`, applies the
mutation, then writes the audit row with both states. Sensitive fields
(password_hash, tokens, secrets) are stripped via `redactForAudit`
before being persisted. The destructive `POST /api/setup/reset-database`
writes top-level row counts in `metadata.rows_before` instead of a
row diff. Validation-stage rejections at the JSON-parser layer
(eg req.body fails JSON.parse, or a handler's own field-presence
check returns 400 before reaching the try/catch) are NOT audited
because the handler never runs to fire `logAuditEvent`, documented
limitation per #588 spec D5.

`requireAuth: false` is set on the seven pre-auth endpoints
(`auth.login`, `auth.register`, `auth.password-reset.request`,
`auth.password-reset.complete`, `auth.refresh-token`,
`billing.checkout.start`, `billing.checkout.status`) so failed pre-auth
attempts still get audited. All other endpoints use the default
`requireAuth: true`.

## Not in scope today

- Tenant content (/api/ideas, /api/comments, /api/votes,
  /api/analytics): high-volume, not forensically relevant. Out of
  scope for any audit phase.

## Kill switch

`ENABLE_AUDIT_LOGGING=false` in the backend container env disables all
middleware-based audit writes. Use only for emergency incident-response
triage if the platform DB is degraded. The kill switch does not affect
`logAuditEvent` calls inside route handlers.

## Retention

Rows in `audit_logs` are retained for `AUDIT_LOG_RETENTION_DAYS` (default
90) days. A daily cron at 03:00 UTC (`AUDIT_LOG_PRUNE_CRON`) hard-deletes
rows older than the cutoff. The prune job writes a
`maintenance.audit_log_pruned` row when rows are actually deleted (silent
on zero-row runs); that row is itself subject to the same retention.

Both writes and pruning honour `ENABLE_AUDIT_LOGGING=false` (the existing
kill switch). Independent on/off control for the cron is
`AUDIT_LOG_PRUNE_ENABLED` (auto-on in production via `NODE_ENV`, auto-off
elsewhere).

Implementation: `backend/src/jobs/auditLogRetention.js`. Landed in #590.

## Querying

`GET /api/audit/logs` (admin only). Filter by `tenant_id`, `actor_id`,
`action`, `resource_type`, `start_date`, `end_date`. See
`backend/src/middleware/auditLog.js` `AuditLog.query` for the full
filterable schema.
