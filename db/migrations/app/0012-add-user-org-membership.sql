-- Issue #804: multi-organisation membership.
-- A User may belong to multiple Organisations. Each membership carries its own
-- role flags. Users.organizationId is retained as the home/canonical org and
-- remains immutable (enforced by the beforeUpdate hook in User.js).

CREATE TABLE IF NOT EXISTS "UserOrganizationMemberships" (
  "id"             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"         UUID         NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "organizationId" VARCHAR(255) NOT NULL,
  "isAdmin"        BOOLEAN      NOT NULL DEFAULT false,
  "isApproved"     BOOLEAN      NOT NULL DEFAULT false,
  "isSuperuser"    BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "organizationId")
);

CREATE INDEX IF NOT EXISTS "idx_uom_userid"
  ON "UserOrganizationMemberships" ("userId");

CREATE INDEX IF NOT EXISTS "idx_uom_orgid"
  ON "UserOrganizationMemberships" ("organizationId");

-- Backfill: seed one membership row per existing user using their current
-- organizationId and role flags. Convention per CLAUDE.md: new role columns
-- must backfill existing users in the same migration.
INSERT INTO "UserOrganizationMemberships"
  ("userId", "organizationId", "isAdmin", "isApproved", "isSuperuser")
SELECT
  "id",
  "organizationId",
  "isAdmin",
  "isApproved",
  "isSuperuser"
FROM "Users"
WHERE "organizationId" IS NOT NULL
ON CONFLICT ("userId", "organizationId") DO NOTHING;
