-- Migration 0018: consultant payment confirmation log
-- Records each payment Rodney confirms against a consultant's invoice,
-- one row per period (month + year) per payment event.

CREATE TABLE IF NOT EXISTS "ConsultantPayments" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "consultantId" UUID NOT NULL REFERENCES "Consultants"(id) ON DELETE CASCADE,
  "periodMonth"  INTEGER NOT NULL CHECK ("periodMonth" >= 1 AND "periodMonth" <= 12),
  "periodYear"   INTEGER NOT NULL CHECK ("periodYear" >= 2020),
  "amountCents"  INTEGER NOT NULL CHECK ("amountCents" > 0),
  notes          TEXT,
  "confirmedAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ConsultantPayments_consultantId_idx"
  ON "ConsultantPayments"("consultantId");
