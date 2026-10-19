-- Migration 0016: Add CommissionRuns table
-- Issue #808 Phase 3 -- monthly commission calculation cron + internal dashboard.

CREATE TABLE IF NOT EXISTS "CommissionRuns" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "consultantId"         UUID NOT NULL REFERENCES "Consultants"("id") ON DELETE RESTRICT,
  "periodStart"          TIMESTAMPTZ NOT NULL,
  "periodEnd"            TIMESTAMPTZ NOT NULL,
  "orgCount"             INTEGER NOT NULL DEFAULT 0,
  "totalGrossCents"      INTEGER NOT NULL DEFAULT 0,
  "totalCommissionCents" INTEGER NOT NULL DEFAULT 0,
  "currency"             VARCHAR(3) NOT NULL DEFAULT 'aud',
  "emailSent"            BOOLEAN NOT NULL DEFAULT false,
  "emailSentAt"          TIMESTAMPTZ,
  "runAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "triggeredBy"          VARCHAR(20) NOT NULL DEFAULT 'cron',
  "notes"                TEXT,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_commissionruns_consultantid"
  ON "CommissionRuns" ("consultantId");
