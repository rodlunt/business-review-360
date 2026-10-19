# Control Plane Database (br360_platform)

**Issue:** [#326 - Create control plane DB br360_platform](https://github.com/rodlunt/business-review-360/issues/326)

---

## Overview

The Business Review 360 application uses a **dual-database architecture** to separate concerns:

### 1. **Application Database** (`business_review_db`)
- **Purpose:** Tenant-specific application data
- **Contains:** Ideas, Comments, Votes, Users, Categories
- **Access:** Row-Level Security (RLS) enforced per tenant

### 2. **Platform Database** (`br360_platform`) ⭐ NEW
- **Purpose:** Multi-tenant control plane for billing and provisioning
- **Contains:** Tenants, Subscriptions, Billing, Provisioning Jobs, Audit Logs
- **Access:** System-level only, not exposed to tenants

---

## Why Two Databases?

| Aspect | Benefit |
|--------|---------|
| **Security** | Billing data completely isolated from tenant data |
| **Scalability** | Scale application and platform databases independently |
| **Multi-tenancy** | Single source of truth for tenant metadata |
| **Clear Boundaries** | Platform operations vs application operations |
| **Compliance** | Easier to audit and secure billing data |

---

## Database Schema

### Core Tables

#### `tenants`
Master tenant registry linking to application organizations

```sql
id              UUID PRIMARY KEY
org_id          VARCHAR(255) UNIQUE    -- Links to Organizations.organizationId
tenant_name     VARCHAR(255)
plan            VARCHAR(50)             -- free, pro, enterprise
status          VARCHAR(50)             -- pending, active, suspended, cancelled
base_url        VARCHAR(500)            -- Custom domain or subdomain
limits          JSONB                   -- Plan limits (maxIdeas, maxUsers, etc.)
created_at      TIMESTAMP
```

#### `stripe_customers`
Links tenants to Stripe customer records

```sql
id                  UUID PRIMARY KEY
tenant_id           UUID REFERENCES tenants(id)
stripe_customer_id  VARCHAR(255) UNIQUE
email               VARCHAR(255)
name                VARCHAR(255)
```

#### `stripe_subscriptions`
Tracks active and historical subscriptions

```sql
id                      UUID PRIMARY KEY
tenant_id               UUID REFERENCES tenants(id)
stripe_subscription_id  VARCHAR(255) UNIQUE
status                  VARCHAR(50)          -- active, past_due, canceled
plan_id                 VARCHAR(255)         -- Stripe price ID
plan_name               VARCHAR(50)          -- pro, enterprise
billing_interval        VARCHAR(20)          -- month, year
amount                  INTEGER              -- Amount in cents
current_period_end      TIMESTAMP
```

#### `stripe_events`
Webhook event log for idempotency and debugging

```sql
id              VARCHAR(255) PRIMARY KEY  -- Stripe event ID
type            VARCHAR(100)              -- checkout.session.completed, etc.
payload         JSONB                     -- Full Stripe event
processed       BOOLEAN
created_at      TIMESTAMP
```

#### `provisioning_jobs`
Asynchronous tenant provisioning task queue

```sql
id              UUID PRIMARY KEY
tenant_id       UUID REFERENCES tenants(id)
job_type        VARCHAR(50)              -- create_tenant, upgrade_tenant
status          VARCHAR(50)              -- pending, in_progress, completed, failed
input_data      JSONB
output_data     JSONB
retry_count     INTEGER
```

#### `pricing_plans`
Define available pricing plans (seeded with Free, Pro, Enterprise)

```sql
id                      UUID PRIMARY KEY
plan_code               VARCHAR(50) UNIQUE   -- free, pro, enterprise
plan_name               VARCHAR(255)
monthly_price           INTEGER              -- Cents
yearly_price            INTEGER              -- Cents (discounted)
limits                  JSONB                -- Plan limits
stripe_monthly_price_id VARCHAR(255)
```

#### `features_catalog`
Define features available in each plan

```sql
id              UUID PRIMARY KEY
feature_code    VARCHAR(50) UNIQUE       -- core_features, sso, etc.
feature_name    VARCHAR(255)
description     TEXT
category        VARCHAR(50)              -- core, advanced, enterprise
```

#### `audit_log_platform`
Platform-level audit trail for compliance

```sql
id              UUID PRIMARY KEY
tenant_id       UUID REFERENCES tenants(id)
action          VARCHAR(100)             -- tenant_created, subscription_updated
actor_type      VARCHAR(50)              -- system, admin, user
details         JSONB
ip_address      INET
created_at      TIMESTAMP
```

---

## Environment Variables

Add to your `.env` file:

```bash
# Platform Database (Control Plane - Billing & Tenancy)
PLATFORM_DATABASE_URL=postgres://business_review_user:your_password@db:5432/br360_platform
```

**Note:** Both databases use the same PostgreSQL user and credentials.

---

## Database Initialization

### Docker Compose Setup

The `docker-compose.yml` mounts initialization scripts that run in order:

1. **`00-init-databases.sql`** - Creates `br360_platform` database
2. **`01-schema.sql`** - Creates application tables in `business_review_db`
3. **`02-data.sql`** - Seeds test data in `business_review_db`
4. **`03-platform-schema.sql`** - Creates platform tables in `br360_platform`
5. **`04-init-platform.sh`** - Verifies platform database setup

### Fresh Database Setup

To create a fresh database with both databases:

```bash
# Stop and remove volumes (⚠️ DELETES ALL DATA)
docker-compose down -v

# Start services (will run initialization scripts)
docker-compose up -d db backend

# Verify both databases exist
docker exec -it business-review-360-db-1 psql -U business_review_user -l
```

You should see:
- `business_review_db` (application database)
- `br360_platform` (platform database)

---

## Usage in Code

### Connecting to Platform Database

```javascript
import { platformSequelize, testPlatformConnection } from "./models/platformDatabase.js";

// Test connection
await testPlatformConnection();

// Execute raw queries
const tenants = await platformSequelize.query(
  "SELECT * FROM tenants WHERE status = :status",
  {
    replacements: { status: "active" },
    type: Sequelize.QueryTypes.SELECT
  }
);
```

### Application Database (Existing)

```javascript
import { sequelize } from "./models/database.js";

// This connects to business_review_db (unchanged)
const ideas = await Idea.findAll();
```

---

## Seeded Data

The platform database comes pre-configured with:

### Pricing Plans

| Plan | Code | Monthly (AUD) | Yearly (AUD) | Max Ideas | Max Users |
|------|------|---------------|--------------|-----------|-----------|
| Free | `free` | $0 | $0 | 25 | 5 |
| Pro | `pro` | $49.95 | $509.40 | 500 | 50 |
| Enterprise | `enterprise` | $249.00 | $2,539.80 | Unlimited | Unlimited |

### Features

- `core_features` - Idea submission, voting, commenting
- `advanced_analytics` - Detailed insights and reporting
- `priority_support` - Email support with faster response times
- `custom_branding` - Custom logo and colors
- `sso` - Single Sign-On (SAML/OAuth)
- `dedicated_support` - Phone and video support
- `sla` - 99.9% uptime guarantee

---

## Accessing Databases

### Via Docker Exec

```bash
# Access application database
docker exec -it business-review-360-db-1 psql -U business_review_user -d business_review_db

# Access platform database
docker exec -it business-review-360-db-1 psql -U business_review_user -d br360_platform
```

### Useful Queries

```sql
-- List all tenants
SELECT org_id, tenant_name, plan, status FROM tenants;

-- Check pricing plans
SELECT plan_code, plan_name, monthly_price, yearly_price FROM pricing_plans;

-- View recent provisioning jobs
SELECT job_type, status, created_at FROM provisioning_jobs ORDER BY created_at DESC LIMIT 10;

-- Check Stripe events
SELECT id, type, processed, created_at FROM stripe_events ORDER BY created_at DESC LIMIT 20;
```

---

## Migration Strategy

### Phase 1: Database Foundation (Current)
- ✅ Create `br360_platform` database
- ✅ Define schema for tenants, billing, provisioning
- ✅ Seed pricing plans and features

### Phase 2: Backfill (Issue #327, #328)
- Add `tenant_id` column to application tables
- Backfill `tenant_id` from existing `organizationId`
- Create tenant records in platform database for existing orgs

### Phase 3: Enable RLS (Issue #328)
- Enable Row-Level Security on application tables
- Enforce tenant isolation at database level

### Phase 4: Deprecate Organizations (Issue #329)
- Use platform `tenants` table as source of truth
- Keep `Organizations` table for backward compatibility

---

## Rollback Procedure

If you need to roll back to single-database setup:

1. **Stop services:**
   ```bash
   docker-compose down
   ```

2. **Remove platform database references:**
   - Remove `PLATFORM_DATABASE_URL` from `.env`
   - Remove platform database volumes from `docker-compose.yml`

3. **Restart with clean volumes:**
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

**Note:** This deletes all data. Only use in development!

---

## Security Considerations

### Access Control
- Platform database is **system-level only**
- No tenant users have direct access
- All access via backend API with proper authorization

### Data Isolation
- Billing data completely separate from tenant application data
- Even if RLS is bypassed, billing data remains isolated
- Audit logs track all platform-level operations

### Secrets Management
- Database credentials stored in `.env` (not committed to git)
- Production uses secure environment variable injection
- Stripe keys stored separately, never in database

---

## Troubleshooting

### Problem: "PLATFORM_DATABASE_URL is not set"

**Solution:** Add the variable to your `.env` file:
```bash
PLATFORM_DATABASE_URL=postgres://business_review_user:your_password@db:5432/br360_platform
```

### Problem: "database br360_platform does not exist"

**Solution:** Recreate database volumes:
```bash
docker-compose down -v
docker-compose up -d db backend
```

### Problem: "permission denied for table tenants"

**Solution:** Ensure the database user has proper permissions:
```sql
GRANT ALL PRIVILEGES ON DATABASE br360_platform TO business_review_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO business_review_user;
```

---

## Next Steps

After completing Issue #326, proceed with:

1. **Issue #327** - Add `tenant_id` columns to application tables
2. **Issue #328** - Backfill `tenant_id` and enable RLS (HIGH RISK)
3. **Issue #329** - Deprecate Organizations as source of truth

---

## Related Documentation

- Execution Plan
- Current Focus
- [Issue #326](https://github.com/rodlunt/business-review-360/issues/326)
- [Epic #318](https://github.com/rodlunt/business-review-360/issues/318)

---

**Questions?** See the execution plan or ask in [Issue #326](https://github.com/rodlunt/business-review-360/issues/326).
