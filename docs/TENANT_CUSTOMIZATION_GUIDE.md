# Tenant Customization Guide

**Date:** 2025-10-28
**Epic:** [#318 - Billing and Tenancy v1](https://github.com/rodlunt/business-review-360/issues/318)

---

## Overview

The platform supports **per-tenant customization** of plan limits and features. Each tenant starts with their chosen plan's default limits, but these can be customized on a case-by-case basis without affecting other tenants.

---

## Architecture

### Database Structure

**Platform Database:** `br360_platform`

```sql
-- Tenants table stores per-tenant configuration
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  org_id VARCHAR(255) UNIQUE NOT NULL,
  tenant_name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) NOT NULL,           -- 'free', 'pro', 'enterprise', 'custom'
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
  limits JSONB NOT NULL,                -- ⭐ Per-tenant customizable limits
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Pricing plans table stores default plan configurations
CREATE TABLE pricing_plans (
  id UUID PRIMARY KEY,
  plan_code VARCHAR(50) UNIQUE NOT NULL,
  plan_name VARCHAR(100) NOT NULL,
  description TEXT,
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'aud',
  limits JSONB NOT NULL,               -- Default limits for this plan
  features JSONB NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Key Design Principles

1. **Plan-Based Defaults**: When a tenant signs up, their `tenants.limits` is copied from `pricing_plans.limits`
2. **Per-Tenant Overrides**: After signup, `tenants.limits` can be customized independently
3. **Immutable Plan Definitions**: Changes to `pricing_plans` don't affect existing tenants
4. **Future-Proof**: New limits can be added to the JSONB without schema changes

---

## Current Pricing Plans

### Plan 1: Free
```json
{
  "plan_code": "free",
  "plan_name": "Free",
  "monthly_price": 0,
  "yearly_price": 0,
  "limits": {
    "maxIdeas": 25,
    "maxUsers": 5,
    "maxStorage": 524288000  // 500 MB
  },
  "features": ["core_features", "community_support"]
}
```

### Plan 2: Pro
```json
{
  "plan_code": "pro",
  "plan_name": "Pro",
  "monthly_price": 4995,  // $49.95 AUD
  "yearly_price": 50940,  // $509.40 AUD (15% off)
  "limits": {
    "maxIdeas": 100,
    "maxUsers": 20,
    "maxStorage": 524288000  // 500 MB
  },
  "features": [
    "core_features",
    "advanced_analytics",
    "priority_support",
    "custom_branding"
  ]
}
```

### Plan 3: Business
```json
{
  "plan_code": "enterprise",  // Note: code is still 'enterprise'
  "plan_name": "Business",
  "monthly_price": 24900,  // $249.00 AUD
  "yearly_price": 253980,  // $2,539.80 AUD (15% off)
  "limits": {
    "maxIdeas": 500,
    "maxUsers": 50,
    "maxStorage": 2147483648  // 2 GB
  },
  "features": [
    "core_features",
    "advanced_analytics",
    "priority_support",
    "custom_branding"
  ]
}
```

### Plan 4: Enterprise (Custom)
```json
{
  "plan_code": "custom",
  "plan_name": "Enterprise",
  "monthly_price": 0,  // Contact sales
  "yearly_price": 0,   // Contact sales
  "limits": {
    "maxIdeas": -1,    // Unlimited
    "maxUsers": -1,    // Unlimited
    "maxStorage": -1   // Unlimited
  },
  "features": [
    "core_features",
    "advanced_analytics",
    "priority_support",
    "custom_branding",
    "custom_deployment",
    "dedicated_support",
    "sso",
    "sla",
    "custom_integrations"
  ]
}
```

**Note:** `-1` means unlimited (no enforcement)

---

## How to Customize Tenant Limits

### Via SQL (Manual)

Connect to the platform database and update the tenant's limits:

```sql
-- Example: Give a Pro tenant extra ideas for a promotion
UPDATE tenants
SET
  limits = '{"maxIdeas": 150, "maxUsers": 20, "maxStorage": 524288000}'::jsonb,
  updated_at = NOW()
WHERE org_id = 'acme-corp';

-- Example: Upgrade a Free tenant to Pro limits without changing their plan
UPDATE tenants
SET
  limits = '{"maxIdeas": 100, "maxUsers": 20, "maxStorage": 524288000}'::jsonb,
  updated_at = NOW()
WHERE org_id = 'startup-demo';

-- Example: Custom limits for enterprise client
UPDATE tenants
SET
  limits = '{"maxIdeas": 2000, "maxUsers": 200, "maxStorage": 10737418240}'::jsonb,
  updated_at = NOW()
WHERE org_id = 'bigcorp';
```

### Via API (Future - Phase 5/7)

A future admin API endpoint will allow updating tenant limits:

```javascript
// PUT /api/admin/tenants/:tenantId/limits
{
  "maxIdeas": 150,
  "maxUsers": 25,
  "maxStorage": 1073741824  // 1 GB
}
```

### Via Admin UI (Future - Phase 5)

An admin dashboard will provide a UI for:
- Viewing current tenant limits
- Adjusting limits with sliders/inputs
- Seeing usage vs limits
- Applying custom configurations

---

## Storage Sizes Reference

When customizing `maxStorage`, use these byte values:

| Size | Bytes | Calculation |
|------|-------|-------------|
| 100 MB | 104,857,600 | 100 * 1024 * 1024 |
| 500 MB | 524,288,000 | 500 * 1024 * 1024 |
| 1 GB | 1,073,741,824 | 1 * 1024 * 1024 * 1024 |
| 2 GB | 2,147,483,648 | 2 * 1024 * 1024 * 1024 |
| 5 GB | 5,368,709,120 | 5 * 1024 * 1024 * 1024 |
| 10 GB | 10,737,418,240 | 10 * 1024 * 1024 * 1024 |
| 100 GB | 107,374,182,400 | 100 * 1024 * 1024 * 1024 |

**JavaScript Helper:**
```javascript
const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

// 5 GB
{ maxStorage: 5 * GB }

// 500 MB
{ maxStorage: 500 * MB }
```

---

## Common Customization Scenarios

### 1. Trial Extension
**Scenario:** Extend a Free plan user's limits during a trial

```sql
UPDATE tenants
SET limits = jsonb_set(limits, '{maxIdeas}', '50')
WHERE org_id = 'trial-customer';
```

### 2. Promotional Upgrade
**Scenario:** Give Pro users double the limits for a promotion

```sql
UPDATE tenants
SET
  limits = '{"maxIdeas": 200, "maxUsers": 40, "maxStorage": 1073741824}'::jsonb,
  updated_at = NOW()
WHERE plan = 'pro' AND org_id IN ('customer1', 'customer2');
```

### 3. Enterprise Negotiation
**Scenario:** Custom limits for enterprise deal

```sql
UPDATE tenants
SET
  limits = '{"maxIdeas": 5000, "maxUsers": 500, "maxStorage": 107374182400}'::jsonb,
  plan = 'custom',
  updated_at = NOW()
WHERE org_id = 'enterprise-client';
```

### 4. Temporary Limit Increase
**Scenario:** Customer needs more ideas for a project, will downgrade later

```sql
-- Increase now
UPDATE tenants
SET limits = jsonb_set(limits, '{maxIdeas}', '200')
WHERE org_id = 'project-customer';

-- Revert later (manually or via scheduled job)
UPDATE tenants
SET limits = jsonb_set(limits, '{maxIdeas}', '100')
WHERE org_id = 'project-customer';
```

---

## Enforcement

Limits are enforced server-side by the `checkPlanLimit()` middleware:

```javascript
// backend/src/middleware/planLimits.js
export function checkPlanLimit(limitType) {
  return async (req, res, next) => {
    if (!req.tenant) {
      return next(); // No tenant context, skip check
    }

    const limits = req.tenant.limits;  // ⭐ Uses per-tenant limits
    const maxValue = limits[`max${limitType.charAt(0).toUpperCase() + limitType.slice(1)}`];

    if (maxValue === -1) {
      return next(); // Unlimited
    }

    // Count current usage
    const currentCount = await countResources(req.tenant.id, limitType);

    if (currentCount >= maxValue) {
      return res.status(403).json({
        error: `You have reached your plan's ${limitType} limit`,
        code: 'PLAN_LIMIT_REACHED',
        limitType,
        current: currentCount,
        max: maxValue,
        plan: req.tenant.plan,
        upgradeUrl: `/org/${req.tenant.org_id}/billing/upgrade`
      });
    }

    next();
  };
}
```

**Applied to routes:**
```javascript
// backend/src/routes/ideas.js
router.post("/",
  authenticate,
  requireSameOrganization,
  checkPlanLimit("maxIdeas"),  // ⭐ Enforces per-tenant limit
  async (req, res) => { ... }
);
```

---

## Querying Tenant Limits

### Get Current Limits

```sql
SELECT
  org_id,
  tenant_name,
  plan,
  limits->'maxIdeas' as max_ideas,
  limits->'maxUsers' as max_users,
  limits->'maxStorage' as max_storage
FROM tenants
WHERE org_id = 'acme-corp';
```

### Find Tenants with Custom Limits

```sql
-- Tenants whose limits don't match their plan's default
SELECT
  t.org_id,
  t.plan,
  t.limits as current_limits,
  pp.limits as plan_defaults
FROM tenants t
JOIN pricing_plans pp ON t.plan = pp.plan_code
WHERE t.limits != pp.limits;
```

### Find Tenants Near Limits

```sql
-- This would require joining with application DB usage stats
-- Example for ideas (would need to query app DB):
SELECT
  org_id,
  tenant_name,
  limits->'maxIdeas' as max_ideas,
  -- usage would come from app DB query
FROM tenants
WHERE (limits->>'maxIdeas')::int != -1;
```

---

## Best Practices

### 1. Document Customizations
When customizing limits, add a note in your admin system:
- Why was it customized?
- Is it temporary or permanent?
- Who approved it?

### 2. Set Review Dates
For temporary customizations, schedule a review:
```sql
-- Add custom metadata (requires schema update)
UPDATE tenants
SET
  limits = '{"maxIdeas": 200, "maxUsers": 40, "maxStorage": 1073741824}'::jsonb,
  metadata = '{"limit_review_date": "2025-12-31", "reason": "Q4 promotion"}'::jsonb
WHERE org_id = 'promo-customer';
```

### 3. Notify Customers
When increasing limits, notify the customer via email or in-app message.

### 4. Monitor Usage
Track if custom limits are actually being used to inform future pricing decisions.

---

## Migration Impact

When updating `pricing_plans` limits:
- **Existing tenants:** NOT affected (they keep their current `tenants.limits`)
- **New signups:** Get the new plan limits
- **Renewals:** Keep existing limits unless explicitly changed

To apply new plan limits to existing tenants:
```sql
-- Apply new Pro plan limits to all Pro tenants
UPDATE tenants
SET limits = (
  SELECT limits FROM pricing_plans WHERE plan_code = 'pro'
)
WHERE plan = 'pro';
```

⚠️ **Warning:** This would override any custom limits! Only do this if intentional.

---

## Future Enhancements

### Phase 5: Admin UI
- Visual limit editor
- Usage vs limit charts
- Bulk limit updates
- Limit history/audit log

### Phase 7: Overage Handling
- Soft limits (warnings)
- Usage-based billing for overages
- Automatic limit increase requests

### Phase 8: Analytics
- Track limit utilization
- Identify upsell opportunities
- Plan recommendation engine

---

## Summary

✅ **Tenant limits are fully customizable per-tenant**
✅ **Changes via direct SQL (now) or admin API (future)**
✅ **Existing tenants unaffected by pricing plan changes**
✅ **Unlimited = -1 (no enforcement)**
✅ **JSONB allows adding new limit types without schema changes**

The platform is designed for flexibility while maintaining data integrity and plan defaults for new customers.
