-- Migration 0021: Add consultant referral attribution to Users (Phase 1)
-- Self-serve registrants join the shared demo-corp org, so there is no new
-- Organization row to stamp with "referredBy". The consultant referral code
-- is captured on the user instead and reconciled to a commission only if and
-- when that user later converts to a paid org. Soft attribution by design:
-- plain VARCHAR, no FK to Consultants."referralCode", so an unknown or
-- mistyped code is stored (never blocks registration) and resolved later.

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "referredByConsultantCode" VARCHAR(64);

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "referralCapturedAt" TIMESTAMPTZ;
