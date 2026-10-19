-- Issue #526: track setup wizard progress per organisation
ALTER TABLE "Organizations"
  ADD COLUMN IF NOT EXISTS "setupWizardCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "setupWizardStep"      SMALLINT NOT NULL DEFAULT 0;
