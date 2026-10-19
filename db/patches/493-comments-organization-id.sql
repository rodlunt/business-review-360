-- =========================================
-- Patch 493: Add organizationId to "Comments"
-- =========================================
-- Issue: https://github.com/rodlunt/business-review-360/issues/493
--
-- Why: every other tenanted entity (Ideas, Categories, Surveys, EmailQueue,
-- EmailLog, ...) carries "organizationId" directly. "Comments" is the
-- exception, and tenant isolation today relies on a join through
-- "Ideas.organizationId". Adding the column directly removes that asymmetry,
-- enables direct route-level filtering (defence in depth alongside RLS
-- "tenant_id"), and simplifies any future RLS policy work.
--
-- Sequence:
--   1. ADD COLUMN nullable so the backfill can populate existing rows.
--   2. UPDATE backfill from the parent "Ideas" row via "ideaId".
--   3. ALTER COLUMN ... SET NOT NULL once every row has a value.
--   4. ADD CONSTRAINT FK to "Organizations"("organizationId") ON DELETE
--      CASCADE, mirroring the existing "Ideas.organizationId" FK.
--   5. CREATE INDEX for the new application-guard filter path.
--
-- BR360 has no schema migration tooling yet (tracked under #584). Until that
-- lands, schema patches live here as one-off idempotent SQL files. To apply
-- this patch on prod:
--
--     docker exec -i business-review-360-db-1 psql \
--         -U business_review_user_0001 -d business_review_db \
--         < db/patches/493-comments-organization-id.sql
--
-- This patch is idempotent: re-running it is a no-op once the column, FK,
-- and index exist. It does NOT replace clean_minimal_schema.sql; the
-- equivalent column + index has been added there so fresh builds get them
-- via the normal db init script.
--
-- The matching "organizationId" type is VARCHAR(255), to match the parent
-- "Organizations"("organizationId") UNIQUE column referenced by every other
-- tenanted table in this schema (UUID "id" is not what gets joined on).

BEGIN;

-- 1. Add column nullable so backfill can run on existing rows.
ALTER TABLE "Comments"
    ADD COLUMN IF NOT EXISTS "organizationId" VARCHAR(255);

-- 2. Backfill from the parent Idea via ideaId. Only touch rows that need it
--    so re-runs do not rewrite already-populated values.
UPDATE "Comments" c
SET "organizationId" = i."organizationId"
FROM "Ideas" i
WHERE c."ideaId" = i.id
  AND c."organizationId" IS NULL;

-- 3. Enforce NOT NULL once every row has a value. The DO block keeps the
--    patch idempotent: SET NOT NULL on an already-NOT-NULL column is a
--    no-op in Postgres, but we guard with a column-state check so a partial
--    earlier run (column added, backfill skipped) surfaces clearly.
DO $$
DECLARE
    null_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_rows FROM "Comments" WHERE "organizationId" IS NULL;
    IF null_rows > 0 THEN
        RAISE EXCEPTION
            'Refusing to SET NOT NULL: % "Comments" rows still have NULL organizationId. Backfill failed (orphan ideaId?).',
            null_rows;
    END IF;
END $$;

ALTER TABLE "Comments" ALTER COLUMN "organizationId" SET NOT NULL;

-- 4. Foreign key to Organizations("organizationId"). ADD CONSTRAINT has no
--    IF NOT EXISTS form, so wrap in a conditional block for idempotence.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'comments_organization_id_fk'
    ) THEN
        ALTER TABLE "Comments"
            ADD CONSTRAINT comments_organization_id_fk
            FOREIGN KEY ("organizationId")
            REFERENCES "Organizations"("organizationId")
            ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Index for the new application-guard filter (organizationId is now in the
--    WHERE clause of every comment read path).
CREATE INDEX IF NOT EXISTS idx_comments_organization
    ON "Comments" ("organizationId");

COMMIT;
