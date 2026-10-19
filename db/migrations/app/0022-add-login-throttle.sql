-- Migration 0022: Add LoginThrottle table
-- Issue #859 -- per-credential login lockout (deferred net-new subsystem
-- from the Phase 5 Security Correction; the rate limiters shipped in 5a
-- are volume throttling, this is per-account brute-force lockout).
--
-- Deliberately NOT tenant data and NOT RLS-protected: it is auth
-- infrastructure keyed by a submitted-credential string, written on the
-- resolveTenant-skipped /api/auth/login path. No RLS policy is added, so
-- the row is readable/writable regardless of role (works in prod under
-- the privileged role AND under the constrained Testcontainers role,
-- unlike the RLS-bound Users lookup in 5a). No Sequelize model is
-- registered for it; the loginThrottle service uses raw parameterised
-- UPSERTs for atomic increment-or-insert.
--
-- "key" is the credential bucket:
--   org-less    : 'email:' + trim(lower(email))
--   org-scoped  : 'org:' + organizationId + ':user:' + lower(username)
-- Counted regardless of whether the account exists, so lock behaviour
-- cannot be used to enumerate accounts.

CREATE TABLE IF NOT EXISTS "LoginThrottle" (
  "key"             TEXT PRIMARY KEY,
  "failedCount"     INTEGER     NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lockedUntil"     TIMESTAMPTZ,
  "lockStrikes"     INTEGER     NOT NULL DEFAULT 0,
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supports an optional future sweep of expired/stale rows (not required
-- for correctness: rows are upserted and reset in place).
CREATE INDEX IF NOT EXISTS "idx_loginthrottle_lockeduntil"
  ON "LoginThrottle" ("lockedUntil");
