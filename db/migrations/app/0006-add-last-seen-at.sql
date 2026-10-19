-- Issue #521: personal changelog tracking
ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ;
