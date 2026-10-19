-- Migration 0024: Add Users.companyName
-- Phase 5 follow-up (#892, PR 3): demo-signup captures the company name of
-- the prospect (separate from Organization.organizationName, which is the
-- BR360 tenant they're being seated into - usually demo-corp). Used by
-- platform-owner lead outreach to know which company the lead represents.
--
-- Optional column. Backfilled NULL on existing rows (no signal lost - the
-- field did not exist when those rows were created).

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "companyName" VARCHAR(255);
