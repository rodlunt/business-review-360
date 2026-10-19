-- =========================================
-- BUSINESS REVIEW 360 - SEED DATA
-- =========================================
-- This file seeds the database with demo-corp organization,
-- test users, and sample ideas for demonstration.
--
-- CREDENTIALS:
--   Admin: dcadmin / Password123!
--   User:  dcuser / Password123!
--
-- Password hash is for: Password123!
-- =========================================

-- =========================================
-- DEMO-CORP ORGANIZATION
-- =========================================
INSERT INTO "Organizations" (
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
    'demo-corp',
    'Demo Insurance Corp',
    'Leading insurance provider with nationwide call centre operations, specializing in auto, home, and life insurance products.',
    'How can we improve customer service, reduce call handling time, and increase policy conversion rates?',
    '#1976d2',
    true,
    true,
    false,
    NOW(),
    NOW()
)
ON CONFLICT ("organizationId") DO UPDATE SET
    "organizationName" = EXCLUDED."organizationName",
    "organizationDescription" = EXCLUDED."organizationDescription",
    "bigQuestion" = EXCLUDED."bigQuestion",
    "primaryColor" = EXCLUDED."primaryColor",
    "updatedAt" = NOW();

-- =========================================
-- USERS (Admin and Regular User)
-- =========================================
-- Password hash is bcrypt of: Password123!
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
    "tenant_id",
    "createdAt",
    "updatedAt"
) VALUES
    -- Admin user (not a superuser — dcsuper is the superuser fixture)
    (
        '66666666-6666-6666-6666-666666666666',
        'dcadmin',
        '$2b$10$1K3I2mHNCmkgVkLGQisLgut38wh67ZmDTIDQaW/JJe2bdEdlu/D2C',
        'admin@democorp.com',
        true,
        false,
        false,
        true,
        'demo-corp',
        '33333333-3333-3333-3333-333333333303',
        NOW(),
        NOW()
    ),
    -- Regular user
    (
        '55555555-5555-5555-5555-555555555555',
        'dcuser',
        '$2b$10$1K3I2mHNCmkgVkLGQisLgut38wh67ZmDTIDQaW/JJe2bdEdlu/D2C',
        'user@democorp.com',
        false,
        false,
        false,
        true,
        'demo-corp',
        '33333333-3333-3333-3333-333333333303',
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO UPDATE SET
    "passwordHash" = EXCLUDED."passwordHash",
    email = EXCLUDED.email,
    "isAdmin" = EXCLUDED."isAdmin",
    "isSuperuser" = EXCLUDED."isSuperuser",
    "organizationId" = EXCLUDED."organizationId",
    "tenant_id" = EXCLUDED."tenant_id",
    "updatedAt" = NOW();

-- =========================================
-- ORG MEMBERSHIPS (#804)
-- =========================================
-- Login requires a UserOrganizationMemberships row (auth.js checks it and
-- returns "You do not have access to this organisation" without one). The
-- 0012 backfill only covered users that existed at migration time, so
-- seeded users need their memberships seeded too. Bit on prod 2026-08-18.
INSERT INTO "UserOrganizationMemberships" ("userId", "organizationId", "isAdmin", "isApproved", "isSuperuser")
VALUES
    ('66666666-6666-6666-6666-666666666666', 'demo-corp', true,  true, false),
    ('55555555-5555-5555-5555-555555555555', 'demo-corp', false, true, false)
ON CONFLICT ("userId", "organizationId") DO UPDATE SET
    "isAdmin" = EXCLUDED."isAdmin",
    "isApproved" = EXCLUDED."isApproved",
    "isSuperuser" = EXCLUDED."isSuperuser";

-- =========================================
-- SAMPLE IDEAS (15 ideas for demo-corp)
-- Insurance & Call Centre themed
-- =========================================
INSERT INTO "Ideas" (
    id, title, description, category, status, priority, "isPinned", "isPrivate",
    "wouldSpendOwnMoney", "timeSavedMinutes", "frequencyCount", "frequencyPeriod",
    "impactScore", "effortScore", "organizationId", "tenant_id", "authorId",
    slug, "createdAt", "updatedAt"
) VALUES
    -- Pinned High Priority Ideas
    ('dc000001-0001-0001-0001-000000000001',
     'AI-Powered Call Routing System',
     'Implement machine learning to route calls to the most suitable agent based on customer history, query type, and agent expertise. This would reduce transfer rates and improve first-call resolution.',
     'Technology', 'In Progress', 10, true, false, true, 180, 500, 'day', 9, 7,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'ai-powered-call-routing-system-10001', NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days'),

    ('dc000002-0002-0002-0002-000000000002',
     'Automated Quote Generation',
     'Create an automated system that generates insurance quotes instantly based on customer input, eliminating wait times and reducing agent workload for routine quote requests.',
     'Process Improvement', 'Complete', 9, true, false, true, 240, 300, 'day', 8, 6,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666666',
     'automated-quote-generation-10002', NOW() - INTERVAL '60 days', NOW() - INTERVAL '10 days'),

    -- Customer Service Improvements
    ('dc000003-0003-0003-0003-000000000003',
     'Self-Service Claim Portal',
     'Develop a mobile app and web portal where customers can file claims, upload photos, and track progress without needing to call. Reduces call volume by an estimated 30%.',
     'Customer Service', 'Reviewing', 8, false, false, true, 300, 150, 'day', 9, 8,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'self-service-claim-portal-10003', NOW() - INTERVAL '40 days', NOW() - INTERVAL '5 days'),

    ('dc000004-0004-0004-0004-000000000004',
     'Real-Time Policy Updates',
     'Allow agents to make policy changes in real-time without supervisor approval for minor adjustments (address changes, payment method updates, etc.).',
     'Process Improvement', 'Reviewing', 7, false, false, false, 120, 200, 'day', 7, 5,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666666',
     'real-time-policy-updates-10004', NOW() - INTERVAL '35 days', NOW() - INTERVAL '7 days'),

    ('dc000005-0005-0005-0005-000000000005',
     'Customer Callback System',
     'Implement a system where customers can request a callback instead of waiting on hold. System calls them back when an agent is available, showing estimated wait time.',
     'Customer Service', 'In Progress', 8, false, false, true, 180, 250, 'day', 8, 4,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'customer-callback-system-10005', NOW() - INTERVAL '50 days', NOW() - INTERVAL '15 days'),

    -- Training & Knowledge Management
    ('dc000006-0006-0006-0006-000000000006',
     'Interactive Training Simulator',
     'Create a VR/AR training simulator for new call centre agents to practice handling difficult customer scenarios before taking real calls.',
     'Training', 'Reviewing', 6, false, false, false, 60, 20, 'day', 7, 8,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666666',
     'interactive-training-simulator-10006', NOW() - INTERVAL '30 days', NOW() - INTERVAL '12 days'),

    ('dc000007-0007-0007-0007-000000000007',
     'Knowledge Base Quick Search',
     'Improve the internal knowledge base with AI-powered search that provides instant answers while agents are on calls. Currently takes too long to find policy information.',
     'Technology', 'In Progress', 9, false, false, true, 150, 400, 'day', 9, 5,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'knowledge-base-quick-search-10007', NOW() - INTERVAL '55 days', NOW() - INTERVAL '3 days'),

    ('dc000008-0008-0008-0008-000000000008',
     'Peer Mentoring Program',
     'Pair experienced agents with new hires for the first 90 days. Reduces training time and improves retention of new call centre staff.',
     'Training', 'Reviewing', 5, false, false, false, 45, 10, 'day', 6, 3,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666666',
     'peer-mentoring-program-10008', NOW() - INTERVAL '25 days', NOW() - INTERVAL '8 days'),

    -- Process Improvements
    ('dc000009-0009-0009-0009-000000000009',
     'Automated Follow-Up System',
     'Send automated SMS/email follow-ups after claims are filed, policy changes are made, or payments are processed. Reduces repeat calls asking for status updates.',
     'Process Improvement', 'Complete', 8, false, false, true, 200, 180, 'day', 8, 5,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'automated-follow-up-system-10009', NOW() - INTERVAL '70 days', NOW() - INTERVAL '20 days'),

    ('dc000010-0010-0010-0010-000000000010',
     'Streamlined Underwriting Process',
     'Reduce the underwriting approval process from 48 hours to 4 hours for standard policies by automating risk assessment for low-risk applicants.',
     'Process Improvement', 'Reviewing', 7, false, false, true, 240, 50, 'day', 8, 7,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666666',
     'streamlined-underwriting-process-10010', NOW() - INTERVAL '20 days', NOW() - INTERVAL '6 days'),

    -- Cost Reduction
    ('dc000011-0011-0011-0011-000000000011',
     'Reduce Paper Forms',
     'Move all customer forms to digital tablets in the office and online portals. Eliminates printing, storage, and manual data entry costs.',
     'Cost Reduction', 'In Progress', 6, false, false, true, 90, 100, 'day', 6, 4,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'reduce-paper-forms-10011', NOW() - INTERVAL '42 days', NOW() - INTERVAL '9 days'),

    ('dc000012-0012-0012-0012-000000000012',
     'Optimize Call Centre Shifts',
     'Use predictive analytics to schedule agents based on historical call volume patterns. Reduces overstaffing during quiet periods and understaffing during peaks.',
     'Cost Reduction', 'Reviewing', 7, false, false, false, 120, 30, 'day', 7, 6,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666666',
     'optimize-call-centre-shifts-10012', NOW() - INTERVAL '28 days', NOW() - INTERVAL '11 days'),

    -- Employee Experience
    ('dc000013-0013-0013-0013-000000000013',
     'Work From Home Option',
     'Allow experienced call centre agents to work remotely 2-3 days per week. Improves morale and expands hiring pool to regional areas.',
     'Employee Experience', 'In Progress', 6, false, false, false, 60, 20, 'day', 7, 5,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'work-from-home-option-10013', NOW() - INTERVAL '38 days', NOW() - INTERVAL '13 days'),

    ('dc000014-0014-0014-0014-000000000014',
     'Agent Performance Dashboard',
     'Give agents access to their own performance metrics (customer satisfaction, first-call resolution, average handling time) to encourage self-improvement.',
     'Employee Experience', 'Reviewing', 5, false, false, false, 30, 40, 'day', 5, 4,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '66666666-6666-6666-6666-666666666666',
     'agent-performance-dashboard-10014', NOW() - INTERVAL '22 days', NOW() - INTERVAL '14 days'),

    ('dc000015-0015-0015-0015-000000000015',
     'Break Room Upgrades',
     'Install better coffee machines, comfortable seating, and quiet relaxation areas in break rooms. High-stress environment needs better decompression spaces.',
     'Employee Experience', 'Reviewing', 4, false, false, false, 15, 50, 'day', 4, 2,
     'demo-corp', '33333333-3333-3333-3333-333333333303', '55555555-5555-5555-5555-555555555555',
     'break-room-upgrades-10015', NOW() - INTERVAL '15 days', NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

-- =========================================
-- SUCCESS MESSAGE
-- =========================================
DO $$
BEGIN
    RAISE NOTICE '✅ Seed data loaded successfully!';
    RAISE NOTICE '   Organization: demo-corp';
    RAISE NOTICE '   Users: dcadmin (admin), dcuser (regular)';
    RAISE NOTICE '   Ideas: 15 sample ideas';
    RAISE NOTICE '   Password: Password123!';
END $$;
