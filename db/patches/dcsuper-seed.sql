-- BR360 prod fixture: dcsuper for demo-corp
--
-- Permanent superuser fixture for demo-corp. Use for testing superuser-only
-- settings, branding, export, and profanity config introduced in issue #769.
--
-- Credentials: dcsuper / Password123!
-- UUID pattern: 44444444-4444-4444-4444-444444444444
--
-- App DB only (no platform DB row needed -- user joins existing demo-corp tenant).
--
-- Apply:
--   ssh your-server 'docker exec -i business-review-360-db-1 psql -U business_review_user_0001 -d business_review_db' < db/patches/dcsuper-seed.sql
--
-- ROLLBACK:
--   DELETE FROM "Users" WHERE id = '44444444-4444-4444-4444-444444444444';

BEGIN;

INSERT INTO "Users" (
    "id",
    "username",
    "passwordHash",
    "email",
    "isAnonymous",
    "isAdmin",
    "isSuperuser",
    "isApproved",
    "organizationId",
    "tenant_id",
    "createdAt",
    "updatedAt"
) VALUES (
    '44444444-4444-4444-4444-444444444444'::UUID,
    'dcsuper',
    '$2b$12$z/qgor2CpL21yvwemPvFSOPVf84EMBJa9n32DL8bw6h9MkC/95PlC',
    'dcsuper@demo-corp.example',
    false,
    true,
    true,
    true,
    'demo-corp',
    '33333333-3333-3333-3333-333333333303'::UUID,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
