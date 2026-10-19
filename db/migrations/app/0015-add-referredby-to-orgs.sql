-- Migration 0015: Add referredBy to Organizations (Phase 2 referral tracking)
-- Stores which consultant referred this organisation so commission can be tracked.
-- References Consultants.referralCode; ON DELETE SET NULL preserves the org record
-- if a consultant is ever removed.

ALTER TABLE "Organizations"
  ADD COLUMN IF NOT EXISTS "referredBy" VARCHAR(50) REFERENCES "Consultants"("referralCode") ON DELETE SET NULL;
