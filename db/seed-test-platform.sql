-- Platform Database Seed Script for E2E Testing
-- This script seeds the demo-corp tenant in br360_platform database

-- =========================================
-- TENANTS (Platform Database)
-- =========================================
INSERT INTO tenants (id, org_id, tenant_name, plan, status, limits)
VALUES
    ('33333333-3333-3333-3333-333333333303'::UUID, 'demo-corp', 'Demo Insurance Corp', 'pro', 'active',
     '{"maxIdeas": 500, "maxUsers": 50, "maxStorage": 5368709120}'::jsonb)
ON CONFLICT (org_id) DO UPDATE SET
    tenant_name = EXCLUDED.tenant_name,
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    updated_at = NOW();
