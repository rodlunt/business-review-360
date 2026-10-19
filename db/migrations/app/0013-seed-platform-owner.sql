-- Seed the platform owner account (platform-owner) so it survives DB resets.
-- On conflict, the UPDATE path corrects role flags without touching immutable fields.
--
-- CORRECTED 2026-08-19 (#953): tenant_id was previously looked up from
-- Organizations.id, on the mistaken belief that that IS the tenant id. RLS
-- compares Users.tenant_id against app.tenant_id, which resolveTenant sets
-- from the PLATFORM tenants.id (a different UUID; platform-schema.sql seeds
-- demo-corp's as the fixed value below, and db/seed-data.sql uses the same
-- constant). Every fresh bring-up therefore minted an owner account that
-- RLS-scoped queries could not see. A cross-database lookup is impossible
-- inside an app-DB migration, so the canonical fixed id is used directly;
-- migration 0027 heals databases that already ran the old version.

INSERT INTO "Users" (
  "id",
  "username",
  "email",
  "passwordHash",
  "isAdmin",
  "isSuperuser",
  "isApproved",
  "isAnonymous",
  "organizationId",
  "tenant_id",
  "createdAt",
  "updatedAt"
)
VALUES (
  '6de30a30-6101-4c2c-a7ef-5bf2e881bae0',
  'platform-owner',
  'owner@example.com',
  '',
  true,
  true,
  true,
  false,
  'demo-corp',
  '33333333-3333-3333-3333-333333333303',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "isAdmin"    = true,
  "isSuperuser" = true,
  "isApproved" = true,
  "updatedAt"  = NOW();

INSERT INTO "UserOrganizationMemberships" (
  "userId",
  "organizationId",
  "isAdmin",
  "isSuperuser",
  "isApproved",
  "createdAt"
) VALUES (
  '6de30a30-6101-4c2c-a7ef-5bf2e881bae0',
  'demo-corp',
  true,
  true,
  true,
  NOW()
)
ON CONFLICT ("userId", "organizationId") DO UPDATE SET
  "isAdmin"    = true,
  "isSuperuser" = true,
  "isApproved" = true;
