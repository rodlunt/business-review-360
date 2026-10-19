-- Issue #527: demo data loading support
-- Add state tracking to Organizations and a tag column to Ideas.

ALTER TABLE "Organizations"
  ADD COLUMN IF NOT EXISTS "demoDataLoaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "demoDataLoadedAt" TIMESTAMP WITH TIME ZONE;

ALTER TABLE "Ideas"
  ADD COLUMN IF NOT EXISTS "isDemoData" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ideas_is_demo_data_idx" ON "Ideas" ("isDemoData");
