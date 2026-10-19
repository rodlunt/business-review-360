-- Tighten ConsultantPayments constraints identified in code review:
--   1. Unique constraint prevents double-recording the same period for a consultant.
--   2. Upper bound on amountCents ($1M AUD) guards against fat-finger data entry.

ALTER TABLE "ConsultantPayments"
  ADD CONSTRAINT "ConsultantPayments_consultant_period_unique"
    UNIQUE ("consultantId", "periodMonth", "periodYear");

ALTER TABLE "ConsultantPayments"
  ADD CONSTRAINT "ConsultantPayments_amountCents_max"
    CHECK ("amountCents" <= 100000000);
