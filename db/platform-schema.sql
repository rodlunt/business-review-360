-- =========================================
-- BR360 PLATFORM DATABASE SCHEMA
-- =========================================
-- This schema is for the br360_platform database (control plane).
-- It manages: tenants, billing, subscriptions, Stripe integration
--
-- Tables:
--   - tenants: Organization/tenant records
--   - pricing_plans: Available subscription plans
--   - stripe_customers: Stripe customer records
--   - stripe_subscriptions: Subscription records
--   - stripe_events: Webhook event log (idempotency)
-- =========================================

-- =========================================
-- TENANTS TABLE
-- Core table for multi-tenancy
-- =========================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) UNIQUE NOT NULL,
    tenant_name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'sme',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'pending', 'trial', 'trial_expired')),
    limits JSONB NOT NULL DEFAULT '{"maxIdeas": 100, "maxUsers": 10, "maxStorage": 1073741824}',
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_org_id ON tenants(org_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- =========================================
-- PRICING PLANS TABLE
-- Available subscription plans
-- =========================================
CREATE TABLE IF NOT EXISTS pricing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code VARCHAR(50) UNIQUE NOT NULL,
    plan_name VARCHAR(100) NOT NULL,
    description TEXT,
    monthly_price INTEGER NOT NULL DEFAULT 0,  -- Price in cents
    yearly_price INTEGER NOT NULL DEFAULT 0,   -- Price in cents
    currency VARCHAR(3) NOT NULL DEFAULT 'AUD',
    stripe_monthly_price_id VARCHAR(255),
    stripe_yearly_price_id VARCHAR(255),
    limits JSONB NOT NULL DEFAULT '{"maxIdeas": 100, "maxUsers": 10, "maxStorage": 1073741824}',
    features JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_plans_plan_code ON pricing_plans(plan_code);
CREATE INDEX IF NOT EXISTS idx_pricing_plans_is_active ON pricing_plans(is_active);

-- =========================================
-- STRIPE CUSTOMERS TABLE
-- Links Stripe customers to tenants
-- =========================================
CREATE TABLE IF NOT EXISTS stripe_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255),
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_tenant_id ON stripe_customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);

-- =========================================
-- STRIPE SUBSCRIPTIONS TABLE
-- Subscription records from Stripe
-- =========================================
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    plan_id VARCHAR(50) NOT NULL,
    plan_name VARCHAR(100),
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
    amount INTEGER NOT NULL DEFAULT 0,  -- Amount in cents
    currency VARCHAR(3) NOT NULL DEFAULT 'AUD',
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_tenant_id ON stripe_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_stripe_id ON stripe_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status ON stripe_subscriptions(status);

-- =========================================
-- STRIPE EVENTS TABLE
-- Webhook event log for idempotency
-- =========================================
CREATE TABLE IF NOT EXISTS stripe_events (
    id VARCHAR(255) PRIMARY KEY,  -- Stripe event ID
    type VARCHAR(100) NOT NULL,
    payload JSONB,
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed);

-- =========================================
-- SALES ENQUIRIES TABLE
-- Captures contact form submissions from the pricing page
-- =========================================
CREATE TABLE IF NOT EXISTS sales_enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),

    company_size VARCHAR(50) NOT NULL,
    plan_interest VARCHAR(50) NOT NULL,
    message TEXT,

    status VARCHAR(50) NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'closed', 'spam')),

    source VARCHAR(100) DEFAULT 'pricing_page',
    notes TEXT,
    assigned_to VARCHAR(255),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    contacted_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sales_enquiries_email ON sales_enquiries(email);
CREATE INDEX IF NOT EXISTS idx_sales_enquiries_status ON sales_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_sales_enquiries_created_at ON sales_enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_enquiries_plan_interest ON sales_enquiries(plan_interest);
CREATE INDEX IF NOT EXISTS idx_sales_enquiries_company_size ON sales_enquiries(company_size);

-- Issue #583: prevent duplicate same-day submissions per email so the
-- SequelizeUniqueConstraintError 409 path in routes/contact.js becomes live.
-- Email is stored already lowercased by the route; the index matches that.
--
-- The day expression casts via AT TIME ZONE 'Australia/Brisbane' before
-- truncation. Reasons:
--   1. date_trunc('day', timestamptz) is STABLE not IMMUTABLE in Postgres
--      (depends on the session timezone), so it is not allowed in an
--      index expression and Postgres rejects it with 42P17.
--   2. Casting timestamptz AT TIME ZONE '<literal>' to timestamp without
--      time zone makes the result deterministic in the input alone, which
--      is IMMUTABLE.
--   3. 'Australia/Brisbane' matches BR360's operational timezone, so two
--      submissions on the same Brisbane day collide as intended; UTC would
--      surprise users either side of midnight Brisbane time.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sales_enquiries_email_day
    ON sales_enquiries (email, (((created_at AT TIME ZONE 'Australia/Brisbane')::date)));

-- =========================================
-- AUDIT LOGS TABLE (Issues #338, #127)
-- Security compliance and support mode tracking
-- =========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    action VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success',

    actor_id UUID,
    actor_email VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL DEFAULT 'user',

    tenant_id UUID,
    resource_type VARCHAR(100),
    resource_id UUID,

    changes JSONB,

    metadata JSONB NOT NULL DEFAULT '{}',
    request_id UUID,

    CHECK (status IN ('success', 'failure', 'denied')),
    CHECK (actor_role IN ('user', 'admin', 'support', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_status ON audit_logs(action, status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changes_gin ON audit_logs USING GIN(changes);

-- =========================================
-- SEED DEFAULT PRICING PLANS
-- =========================================
INSERT INTO pricing_plans (plan_code, plan_name, description, monthly_price, yearly_price, stripe_monthly_price_id, stripe_yearly_price_id, limits, features, is_public)
VALUES
    ('sme', 'SME', 'For small and medium businesses', 2995, 29950,
     NULL, NULL,
     '{"maxIdeas": 100, "maxUsers": 10, "maxStorage": 1073741824}',
     '["Up to 100 ideas", "Up to 10 users", "1 GB storage", "Email support"]',
     true),
    ('pro', 'Professional', 'For growing organizations', 4995, 50940,
     NULL, NULL,
     '{"maxIdeas": 500, "maxUsers": 50, "maxStorage": 5368709120}',
     '["Up to 500 ideas", "Up to 50 users", "5 GB storage", "Priority support", "Analytics dashboard"]',
     true),
    ('enterprise', 'Enterprise', 'For large organizations', 24900, 253980,
     NULL, NULL,
     '{"maxIdeas": -1, "maxUsers": -1, "maxStorage": -1}',
     '["Unlimited ideas", "Unlimited users", "Unlimited storage", "24/7 support", "Custom integrations", "SLA guarantee"]',
     true),
    ('trial', '14-Day Free Trial', 'No credit card required. Full professional access for 14 days.',
     0, 0, NULL, NULL,
     '{"maxIdeas": 500, "maxUsers": 50, "maxStorage": 5368709120}',
     '["Up to 500 ideas", "Up to 50 users", "5 GB storage", "All Professional features"]',
     false)
ON CONFLICT (plan_code) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    monthly_price = EXCLUDED.monthly_price,
    yearly_price = EXCLUDED.yearly_price,
    stripe_monthly_price_id = EXCLUDED.stripe_monthly_price_id,
    stripe_yearly_price_id = EXCLUDED.stripe_yearly_price_id,
    limits = EXCLUDED.limits,
    features = EXCLUDED.features,
    updated_at = NOW();

-- =========================================
-- SEED DEMO-CORP TENANT
-- This allows demo-corp to work with the billing system
-- =========================================
INSERT INTO tenants (id, org_id, tenant_name, plan, status, limits)
VALUES (
    '33333333-3333-3333-3333-333333333303',
    'demo-corp',
    'Demo Insurance Corp',
    'pro',
    'active',
    '{"maxIdeas": 500, "maxUsers": 50, "maxStorage": 5368709120}'
)
ON CONFLICT (org_id) DO UPDATE SET
    tenant_name = EXCLUDED.tenant_name,
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    limits = EXCLUDED.limits,
    updated_at = NOW();

-- =========================================
-- SUCCESS MESSAGE
-- =========================================
DO $$
BEGIN
    RAISE NOTICE '✅ Platform schema created successfully!';
    RAISE NOTICE '   Tables: tenants, pricing_plans, stripe_customers, stripe_subscriptions, stripe_events, sales_enquiries, audit_logs';
    RAISE NOTICE '   Default plans: sme, pro, enterprise';
    RAISE NOTICE '   Demo tenant: demo-corp (pro plan)';
END $$;
