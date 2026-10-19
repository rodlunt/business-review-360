-- Migration 0025: commission constraint tightening (audit findings #928, #929)
--   1. Unique constraint prevents double-recording the same period for a
--      consultant (cron double-fire, retry after partial failure, or manual
--      trigger in the same month). Mirrors the ConsultantPayments guard
--      added in 0019 for the same double-recording risk.
--   2. commissionRate bounded 0..1 in the schema. The bound previously lived
--      only in express-validator on the two /api/internal routes; DECIMAL(5,4)
--      happily stores 9.9999, and the rate multiplies live Stripe revenue in
--      the monthly commission job.
--   3. Non-negative totals on CommissionRuns.
-- Verified before writing: prod has zero CommissionRuns rows and no
-- out-of-range rates, so these apply cleanly.

ALTER TABLE "CommissionRuns"
  ADD CONSTRAINT "CommissionRuns_consultant_period_unique"
    UNIQUE ("consultantId", "periodStart");

ALTER TABLE "Consultants"
  ADD CONSTRAINT "Consultants_commissionRate_range"
    CHECK ("commissionRate" >= 0 AND "commissionRate" <= 1);

ALTER TABLE "ConsultantInvites"
  ADD CONSTRAINT "ConsultantInvites_commissionRate_range"
    CHECK ("commissionRate" >= 0 AND "commissionRate" <= 1);

ALTER TABLE "CommissionRuns"
  ADD CONSTRAINT "CommissionRuns_totalGrossCents_nonneg"
    CHECK ("totalGrossCents" >= 0);

ALTER TABLE "CommissionRuns"
  ADD CONSTRAINT "CommissionRuns_totalCommissionCents_nonneg"
    CHECK ("totalCommissionCents" >= 0);
