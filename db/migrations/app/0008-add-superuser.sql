-- Issue #769: add isSuperuser role above isAdmin.
-- Superusers get full settings access; admins retain user management and analytics.
-- Backfill: promote all existing admins to superuser so no one loses access post-deploy.
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "isSuperuser" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Users" SET "isSuperuser" = true WHERE "isAdmin" = true;
