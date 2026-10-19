-- ==============================================
-- Patch 734: Add organizationId to "CommentVotes"
-- ==============================================
-- Issue: https://github.com/rodlunt/business-review-360/issues/734
--
-- Why: "Comments" carries "organizationId" directly after #493/#726, every
-- other tenanted entity does the same, but "CommentVotes" still relies on a
-- join through "Comments.organizationId" for tenant isolation. That asymmetry
-- is exactly what #493 closed for "Comments". Adding the column directly to
-- "CommentVotes" enables direct route-level filtering as defence in depth
-- alongside RLS "tenant_id", and removes the last comment-tree table that
-- needs a parent join to know its tenant.
--
-- Sequence:
--   1. ADD COLUMN nullable so the backfill can populate existing rows.
--   2. UPDATE backfill from the parent "Comments" row via "commentId".
--   3. ALTER COLUMN ... SET NOT NULL once every row has a value.
--   4. ADD CONSTRAINT FK to "Organizations"("organizationId") ON DELETE
--      CASCADE, mirroring the "Comments.organizationId" FK from #493.
--   5. CREATE INDEX for the new application-guard filter path.
--
-- BR360 has no schema migration tooling yet (#584). Until that lands, schema
-- patches live here as one-off idempotent SQL files. To apply on prod:
--
--     docker exec -i business-review-360-db-1 psql \
--         -U business_review_user_0001 -d business_review_db \
--         < db/patches/734-commentvote-organization-id.sql
--
-- This patch is idempotent: re-running is a no-op once the column, FK, and
-- index exist. clean_minimal_schema.sql is updated in the same PR so fresh
-- builds get the column inline.
--
-- The matching "organizationId" type is VARCHAR(255), to match the parent
-- "Organizations"("organizationId") UNIQUE column referenced by every other
-- tenanted table in this schema.

BEGIN;

-- 1. Add column nullable so backfill can run on existing rows.
ALTER TABLE "CommentVotes"
    ADD COLUMN IF NOT EXISTS "organizationId" VARCHAR(255);

-- 2. Backfill from the parent Comment via commentId. Only touch rows that
--    need it so re-runs do not rewrite already-populated values.
UPDATE "CommentVotes" cv
SET "organizationId" = c."organizationId"
FROM "Comments" c
WHERE cv."commentId" = c.id
  AND cv."organizationId" IS NULL;

-- 3. Enforce NOT NULL once every row has a value. Guard with an explicit
--    NULL count so a partial earlier run (column added, backfill skipped or
--    blocked by an orphan commentId) surfaces clearly rather than failing
--    the SET NOT NULL with a generic message.
DO $$
DECLARE
    null_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_rows FROM "CommentVotes" WHERE "organizationId" IS NULL;
    IF null_rows > 0 THEN
        RAISE EXCEPTION
            'Refusing to SET NOT NULL: % "CommentVotes" rows still have NULL organizationId. Backfill failed (orphan commentId?).',
            null_rows;
    END IF;
END $$;

ALTER TABLE "CommentVotes" ALTER COLUMN "organizationId" SET NOT NULL;

-- 4. Foreign key to Organizations("organizationId"). ADD CONSTRAINT has no
--    IF NOT EXISTS form, so wrap in a conditional block for idempotence.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commentvotes_organization_id_fk'
    ) THEN
        ALTER TABLE "CommentVotes"
            ADD CONSTRAINT commentvotes_organization_id_fk
            FOREIGN KEY ("organizationId")
            REFERENCES "Organizations"("organizationId")
            ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Index for the new application-guard filter (organizationId is now in
--    the WHERE clause of every CommentVote read and mutation path).
CREATE INDEX IF NOT EXISTS idx_commentvotes_organization
    ON "CommentVotes" ("organizationId");

COMMIT;
