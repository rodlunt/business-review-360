-- Migration 0031: add per-tour step-position resume for the three Shepherd
-- onboarding tours (superuser, admin, user).
--
-- Nullable columns, mirroring the hasSeen*Walkthrough pattern. NULL means
-- "no saved position, start at step 0" -- no backfill needed, existing rows
-- simply have no saved position, which is the correct default.
--
-- PATCH /users/walkthrough sets the matching step column when a tour is
-- dismissed mid-way (Shepherd "cancel") and clears it back to NULL when the
-- tour is completed (Shepherd "complete"), so a finished tour never resumes
-- from a stale step.

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "superuserWalkthroughStep" INTEGER,
  ADD COLUMN IF NOT EXISTS "adminWalkthroughStep" INTEGER,
  ADD COLUMN IF NOT EXISTS "userWalkthroughStep" INTEGER;
