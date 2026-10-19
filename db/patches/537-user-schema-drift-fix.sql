-- =====================================================
-- Patch: 537-user-schema-drift-fix.sql
-- Issue: https://github.com/rodlunt/business-review-360/issues/537
--
-- WHAT
--   Aligns the prod "Users" table with the Sequelize User model.
--     1. Adds three engagement-tracking columns if missing
--        (lastActiveAt, lastEngagementEmailSent, lastSurveySent).
--     2. Widens the username column from VARCHAR(50) to VARCHAR(255) to
--        match Sequelize's DataTypes.STRING default.
--
-- WHY
--   Schema-follows-model was the agreed direction (triage 2026-05-01):
--   the model is in production and works; clean_minimal_schema.sql is
--   documentation. Loosening username avoids any risk of truncating live
--   data. A model-side length validator has been added in the same PR as
--   belt-and-braces input validation.
--
-- HOW TO APPLY (production)
--   Run as the owner of the "Users" table on business_review_db:
--     \i db/patches/537-user-schema-drift-fix.sql
--
-- IDEMPOTENCY
--   ADD COLUMN IF NOT EXISTS is a Postgres no-op when the column exists.
--   ALTER COLUMN ... TYPE VARCHAR(255) is safe to re-run on a column that
--   is already VARCHAR(255); Postgres skips the rewrite for non-toasted
--   string widening.
--
-- UNIQUE-INDEX AUDIT (separate manual step)
--   The Sequelize model declares unique: true on username, but
--   sequelize.sync() is disabled in prod so the constraint may or may
--   not exist on the live DB. Run this query on prod to confirm, and
--   add the index manually if missing:
--     SELECT indexname, indexdef
--     FROM pg_indexes
--     WHERE tablename = 'Users' AND indexdef LIKE '%username%';
--   Expected: at least one row whose indexdef contains UNIQUE (username
--   inline UNIQUE constraint creates an index named "Users_username_key"
--   on a fresh build).
-- =====================================================

BEGIN;

-- 1. Engagement-tracking columns (model-only -> add to schema)
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastEngagementEmailSent" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "lastSurveySent" TIMESTAMP WITH TIME ZONE;

-- 2. username type mismatch (VARCHAR(50) -> VARCHAR(255), widening only)
ALTER TABLE "Users" ALTER COLUMN username TYPE VARCHAR(255);

COMMIT;
