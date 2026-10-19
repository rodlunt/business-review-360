-- BR360 e2e fixture: canonical login identities for Phase 5 slice 5c (#867)
--
-- The org-less ("bare domain") login path resolves a user purely by email
-- (cross-tenant User.findAll({where:{email}})) and then drives the picker
-- from approved UserOrganizationMemberships rows (backend/src/routes/auth.js
-- org-less branch). None of the existing fixtures (dcuser, dcadmin, dcsuper,
-- testorg2admin, testorg2user) carry membership rows, and none is multi-org,
-- so the 5c personas need dedicated canonical identities seeded here.
--
-- Reuses the demo-corp + test-org-2 organisations that global-setup.js has
-- already seeded into both databases; it deliberately creates NO new orgs.
-- This patch is APP-DB only (the tenants/Organizations rows already exist).
--
-- Three identities (aaaa / bbbb / cccc UUID prefixes so they are
-- unmistakable as test data and never collide with the 4/5/6/7/8/9
-- fixtures):
--   multiorg@e2e.local   - approved in demo-corp AND test-org-2 (Persona 2:
--                           credentials -> pre-session picker -> land)
--   singleorg@e2e.local  - approved in demo-corp only (Persona 3:
--                           credentials -> land, no picker)
--   consultant@e2e.local - approved in demo-corp only; Persona 1 injects a
--                           reset/activation token onto this row at test
--                           time and drives /reset-password?activation=1
--
-- All three share the Password123! bcrypt hash already used by the other
-- fixtures (db/seed-data.sql, db/patches/test-org-2-seed.sql).
--
-- Emails are deliberately unique so the org-less split-identity fail-safe
-- (auth.js: >1 User row for one email -> 401) is never tripped by a
-- collision with an existing seed email (@democorp.com / @testorg2.local).
--
-- Apply (app DB only):
--   docker exec -i business-review-360-db-1 psql -U <user> -d business_review_db < db/patches/multi-org-user-seed.sql
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING throughout).
--
-- ROLLBACK: see end of file.

-- =========================================
-- APP DB START - run against business_review_db
-- =========================================
BEGIN;

-- -----------------------------------------
-- 1. Canonical Users (one row each, one email, one passwordHash)
--    tenant_id is NOT NULL on Users; bind every row to the demo-corp
--    tenant so the row is internally consistent. The org-less login
--    branch keys off email, not this column, so it is not the selector.
-- -----------------------------------------
INSERT INTO "Users" (
    id,
    username,
    "passwordHash",
    email,
    "isAdmin",
    "isSuperuser",
    "isAnonymous",
    "isApproved",
    "organizationId",
    "primaryOrganizationId",
    "tenant_id",
    -- Seed the per-user tour flags true so selectTour() returns null and
    -- no Shepherd walkthrough fires mid-persona. The Welcome modal still
    -- shows every login by design (locked decision #7); the spec dismisses
    -- it explicitly. This keeps the personas free of Shepherd overlay race.
    "hasSeenSuperuserWalkthrough",
    "hasSeenAdminWalkthrough",
    "hasSeenUserWalkthrough",
    "createdAt",
    "updatedAt"
) VALUES
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'multiorg@e2e.local',
        '$2b$10$1K3I2mHNCmkgVkLGQisLgut38wh67ZmDTIDQaW/JJe2bdEdlu/D2C',
        'multiorg@e2e.local',
        false,
        false,
        false,
        true,
        'demo-corp',
        'demo-corp',
        '33333333-3333-3333-3333-333333333303'::UUID,
        true,
        true,
        true,
        NOW(),
        NOW()
    ),
    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
        'singleorg@e2e.local',
        '$2b$10$1K3I2mHNCmkgVkLGQisLgut38wh67ZmDTIDQaW/JJe2bdEdlu/D2C',
        'singleorg@e2e.local',
        false,
        false,
        false,
        true,
        'demo-corp',
        'demo-corp',
        '33333333-3333-3333-3333-333333333303'::UUID,
        true,
        true,
        true,
        NOW(),
        NOW()
    ),
    (
        'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID,
        'consultant@e2e.local',
        '$2b$10$1K3I2mHNCmkgVkLGQisLgut38wh67ZmDTIDQaW/JJe2bdEdlu/D2C',
        'consultant@e2e.local',
        false,
        false,
        false,
        true,
        'demo-corp',
        'demo-corp',
        '33333333-3333-3333-3333-333333333303'::UUID,
        true,
        true,
        true,
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------
-- 2. Approved memberships. The org-less branch reads
--    UserOrganizationMemberships WHERE isApproved = true; the count
--    decides single-org (direct session) vs multi-org (pick token).
--    Keep Users.isApproved AND every membership row isApproved = true
--    (CLAUDE.md: UserOrganizationMembership-aware rows stay consistent).
-- -----------------------------------------
INSERT INTO "UserOrganizationMemberships" (
    id,
    "userId",
    "organizationId",
    "isAdmin",
    "isApproved",
    "isSuperuser",
    "createdAt"
) VALUES
    -- multiorg: two approved orgs -> picker
    (
        'a0000001-0000-0000-0000-000000000001'::UUID,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'demo-corp',
        false,
        true,
        false,
        NOW()
    ),
    (
        'a0000001-0000-0000-0000-000000000002'::UUID,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
        'test-org-2',
        false,
        true,
        false,
        NOW()
    ),
    -- singleorg: one approved org -> direct session, no picker
    (
        'b0000001-0000-0000-0000-000000000001'::UUID,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID,
        'demo-corp',
        false,
        true,
        false,
        NOW()
    ),
    -- consultant: one approved org -> lands after activation, no picker
    (
        'c0000001-0000-0000-0000-000000000001'::UUID,
        'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID,
        'demo-corp',
        false,
        true,
        false,
        NOW()
    )
ON CONFLICT ("userId", "organizationId") DO NOTHING;

COMMIT;

-- =========================================
-- APP DB END
-- =========================================

-- =========================================
-- VERIFY (run against business_review_db)
-- =========================================
--   SELECT id, username, email, "primaryOrganizationId"
--     FROM "Users" WHERE email LIKE '%@e2e.local';
--   SELECT "userId", "organizationId", "isApproved"
--     FROM "UserOrganizationMemberships"
--    WHERE "userId" IN (
--      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
--      'cccccccc-cccc-cccc-cccc-cccccccccccc');
-- Expected: 3 Users, 4 membership rows (multiorg has 2).

-- =========================================
-- ROLLBACK (run against business_review_db)
-- =========================================
--   BEGIN;
--   DELETE FROM "UserOrganizationMemberships"
--    WHERE "userId" IN (
--      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
--      'cccccccc-cccc-cccc-cccc-cccccccccccc');
--   DELETE FROM "Users" WHERE email LIKE '%@e2e.local';
--   COMMIT;
