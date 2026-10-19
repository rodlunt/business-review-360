-- BR360 prod fixture: test-org-2 for cross-tenant smoke tests
--
-- Mirrors db/seed-data.sql + db/seed-test-platform.sql for demo-corp,
-- but uses a 7s/8s/9s UUID pattern so it is unmistakable as test data.
--
-- USERS (both have password Password123! - same hash as dcadmin/dcuser):
--   testorg2admin / Password123!  (admin)
--   testorg2user  / Password123!  (regular)
--
-- IMPORTANT: BR360 has TWO databases.
--   br360_platform  - holds the tenants table (queried by tenantResolver middleware)
--   business_review_db - holds Organizations, Users, Ideas, etc.
--
-- Apply ORDER MATTERS - run the platform-DB block first, then the app-DB block:
--   ssh your-server 'docker exec -i business-review-360-db-1 psql -U business_review_user_0001 -d br360_platform' < <(sed -n "/-- PLATFORM DB START/,/-- PLATFORM DB END/p" db/patches/test-org-2-seed.sql)
--   ssh your-server 'docker exec -i business-review-360-db-1 psql -U business_review_user_0001 -d business_review_db' < <(sed -n "/-- APP DB START/,/-- APP DB END/p" db/patches/test-org-2-seed.sql)
--
-- After applying, restart the backend container to bust the in-memory tenant cache:
--   ssh your-server 'docker restart business-review-360-backend-1'
--
-- ROLLBACK: see end of file.

-- =========================================
-- PLATFORM DB START - run against br360_platform
-- =========================================
BEGIN;

-- =========================================
-- 1. tenants (platform-side row)
-- =========================================
INSERT INTO tenants (id, org_id, tenant_name, plan, status, limits)
VALUES (
    '33333333-3333-3333-3333-333333333304'::UUID,
    'test-org-2',
    'Test Org Two',
    'sme',
    'active',
    '{"maxIdeas": 100, "maxUsers": 10, "maxStorage": 1073741824}'::jsonb
)
ON CONFLICT (org_id) DO NOTHING;

COMMIT;

-- =========================================
-- PLATFORM DB END
-- =========================================

-- =========================================
-- APP DB START - run against business_review_db
-- =========================================
BEGIN;

-- =========================================
-- 2. Organizations (app-side row)
-- =========================================
INSERT INTO "Organizations" (
    id,
    "organizationId",
    "organizationName",
    "organizationDescription",
    "bigQuestion",
    "primaryColor",
    "useCaptcha",
    "enablePwaPrompt",
    "logoHighContrast",
    "createdAt",
    "updatedAt"
) VALUES (
    '77777777-7777-7777-7777-777777777777'::UUID,
    'test-org-2',
    'Test Org Two',
    'Cross-tenant smoke test fixture (created via db/patches/test-org-2-seed.sql).',
    'Smoke-test placeholder question',
    '#1976d2',
    true,
    true,
    false,
    NOW(),
    NOW()
)
ON CONFLICT ("organizationId") DO NOTHING;

-- =========================================
-- 3. Users (admin + regular, both tenant_id bound)
-- =========================================
-- bcrypt hash is for: Password123! (same as dcadmin/dcuser per db/seed-data.sql)
INSERT INTO "Users" (
    id,
    username,
    "passwordHash",
    email,
    "isAdmin",
    "isAnonymous",
    "isApproved",
    "organizationId",
    "tenant_id",
    "createdAt",
    "updatedAt"
) VALUES
    (
        '88888888-8888-8888-8888-888888888888'::UUID,
        'testorg2admin',
        '$2b$10$1K3I2mHNCmkgVkLGQisLgut38wh67ZmDTIDQaW/JJe2bdEdlu/D2C',
        'admin@testorg2.local',
        true,
        false,
        true,
        'test-org-2',
        '33333333-3333-3333-3333-333333333304'::UUID,
        NOW(),
        NOW()
    ),
    (
        '99999999-9999-9999-9999-999999999999'::UUID,
        'testorg2user',
        '$2b$10$1K3I2mHNCmkgVkLGQisLgut38wh67ZmDTIDQaW/JJe2bdEdlu/D2C',
        'user@testorg2.local',
        false,
        false,
        true,
        'test-org-2',
        '33333333-3333-3333-3333-333333333304'::UUID,
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =========================================
-- APP DB END
-- =========================================

-- =========================================
-- VERIFY (run against the relevant DB)
-- =========================================
-- Against br360_platform:
--   SELECT id, org_id, tenant_name, plan, status FROM tenants WHERE org_id = 'test-org-2';
-- Against business_review_db:
--   SELECT id, "organizationId", "organizationName" FROM "Organizations" WHERE "organizationId" = 'test-org-2';
--   SELECT id, username, email, "organizationId", "isAdmin" FROM "Users" WHERE "organizationId" = 'test-org-2';

-- =========================================
-- ROLLBACK (run if you want to remove the fixture)
-- =========================================
-- Against business_review_db:
--   BEGIN;
--   DELETE FROM "Users" WHERE "organizationId" = 'test-org-2';
--   DELETE FROM "Organizations" WHERE "organizationId" = 'test-org-2';
--   COMMIT;
-- Against br360_platform:
--   BEGIN;
--   DELETE FROM tenants WHERE org_id = 'test-org-2';
--   COMMIT;
-- Then restart the backend to clear cache:
--   ssh your-server 'docker restart business-review-360-backend-1'
