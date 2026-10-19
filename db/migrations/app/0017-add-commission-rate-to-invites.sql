-- Migration 0017: Add commissionRate to ConsultantInvites
-- Stores the agreed rate at invite time so it can be applied on signup.

ALTER TABLE "ConsultantInvites"
  ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.3;
