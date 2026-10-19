-- Migration 0027: heal the platform owner's tenant_id (#953)
--
-- Migration 0013 (as originally shipped) seeded the platform owner's tenant_id from
-- Organizations.id, but RLS compares Users.tenant_id against the PLATFORM
-- tenants.id that resolveTenant provides, so on any database bootstrapped
-- with the old 0013 the owner account was invisible to every RLS-scoped
-- query. 0013 is corrected in place for fresh databases; this migration
-- repairs databases that already ran the old version. Idempotent: a row
-- already carrying the canonical id (already repaired by hand)
-- is a no-op.

UPDATE "Users"
SET "tenant_id" = '33333333-3333-3333-3333-333333333303'
WHERE "id" = '6de30a30-6101-4c2c-a7ef-5bf2e881bae0'
  AND "organizationId" = 'demo-corp'
  AND "tenant_id" <> '33333333-3333-3333-3333-333333333303';
