-- Platform migration: add free-trial support (#531)
-- Apply against br360_platform database.
-- Safe to re-run: all statements are idempotent.

-- 1. Add trial_ends_at to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 2. Widen the status CHECK constraint to include trial states.
--    PostgreSQL doesn't support ALTER CONSTRAINT; drop and re-add.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
    CHECK (status IN ('active', 'suspended', 'cancelled', 'pending', 'trial', 'trial_expired'));

-- 3. Add a trial pricing plan (pro-level limits, not publicly listed).
INSERT INTO pricing_plans (plan_code, plan_name, description, monthly_price, yearly_price,
    limits, features, is_active, is_public)
VALUES (
    'trial',
    '14-Day Free Trial',
    'No credit card required. Full professional access for 14 days.',
    0, 0,
    '{"maxIdeas": 500, "maxUsers": 50, "maxStorage": 5368709120}',
    '["Up to 500 ideas", "Up to 50 users", "5 GB storage", "All Professional features"]',
    true,
    false
)
ON CONFLICT (plan_code) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    limits = EXCLUDED.limits,
    features = EXCLUDED.features,
    updated_at = NOW();

-- 4. Index for efficient daily cron queries over active trials.
CREATE INDEX IF NOT EXISTS idx_tenants_trial_ends_at
    ON tenants (trial_ends_at)
    WHERE plan = 'trial' AND status IN ('trial', 'trial_expired');
