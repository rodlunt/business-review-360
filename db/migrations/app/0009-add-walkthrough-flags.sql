-- Issue #766/#767/#768: per-user walkthrough flags.
-- One flag per role so each walkthrough can be triggered independently.
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "hasSeenSuperuserWalkthrough" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "hasSeenAdminWalkthrough" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "hasSeenUserWalkthrough" BOOLEAN NOT NULL DEFAULT false;
