# Schema and Migration Summary

**Date**: 2025-11-08
**Status**: ✅ Consolidated - Single-file schemas ready for deployment

## 🎯 Overview

The database setup has been consolidated into **single-file schemas** to eliminate confusion and simplify Docker deployments.

## 📁 File Structure

### Production Schema Files (Use These)

#### Application Database

**File**: `db/clean_minimal_schema.sql`
**Database**: `business_review_db`
**Purpose**: Complete application database with all features

**Includes:**

- ✅ Multi-tenancy (Migrations 001-002)
  - `tenant_id` UUID NOT NULL on all tables
  - Row-Level Security (RLS) enabled
  - Tenant context set transaction-locally by `wrapTenantTransaction`
    middleware via `SET LOCAL app.tenant_id` (#561). The legacy
    session-level `set_tenant_context(uuid)` SQL function was dropped
    by patch `db/patches/561-drop-set-tenant-context.sql`.
  - Per-tenant unique indexes
- ✅ Frequency tracking (Migration 006)
  - `frequencyCount` INTEGER
  - `frequencyPeriod` VARCHAR(20)
- ✅ All standard tables: Organizations, Users, Ideas, Comments, Votes, Categories
- ✅ Legacy compatibility: `organizationId` still present

#### Platform Database

**File**: `db/platform_schema.sql`
**Database**: `br360_platform`
**Purpose**: Multi-tenant control plane

**Includes:**

- ✅ Tenants table with plan limits
- ✅ Stripe integration (customers, subscriptions, events)
- ✅ Provisioning jobs
- ✅ Pricing plans (Migration 003 updates)
- ✅ Sales inquiries (Migration 004)
- ✅ Audit logs (Migration 005)

### Migration Files (For Existing Databases Only)

#### Consolidated Migration

**File**: `db/migrations/CONSOLIDATED_001-006_app_database.sql`
**Use**: Apply ALL migrations to existing production databases at once

**Includes:**

- Migration 001: Add tenant_id columns
- Migration 002: Backfill tenant_id + enable RLS
- Migration 006: Add frequency tracking

#### Individual Migrations (Preserved for Reference)

- `001_add_tenant_id_columns.sql` - Add tenant_id to all tables
- `002_backfill_tenant_id_enable_rls.sql` - Populate tenant_id + RLS setup
- `003_update_pricing_plans.sql` - Update platform pricing (already in platform_schema.sql)
- `004_add_sales_inquiries_table.sql` - Add sales table (already in platform_schema.sql)
- `005_add_audit_logs_table.sql` - Add audit table (already in platform_schema.sql)
- `006_add_frequency_tracking.sql` - Add frequency columns

## 🚀 Deployment Guide

### Fresh Installation (Docker)

```bash
# Just start Docker - schemas are complete
docker-compose up -d
```

**What happens:**

1. PostgreSQL 15 container starts
2. `00-init-databases.sql` creates both databases
3. `01-schema.sql` (clean_minimal_schema.sql) creates app tables with tenant_id + RLS
4. `02-data.sql` seeds test data
5. `03-platform-schema.sql` creates platform tables
6. `04-init-platform.sh` initializes platform DB

### Existing Production Database

```bash
# 1. Backup first!
docker exec business-review-360-db-1 pg_dump -U business_review_user business_review_db > backup.sql

# 2. Apply consolidated migration
docker exec -i business-review-360-db-1 psql -U business_review_user -d business_review_db < db/migrations/CONSOLIDATED_001-006_app_database.sql

# 3. Restart services
docker-compose restart backend frontend
```

## 🔍 Key Differences: tenant_id vs organizationId

### tenant_id (UUID)

- **Type**: UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- **Purpose**: Internal tenant identifier for RLS
- **Database**: Primary key in `br360_platform.tenants.id`
- **Used for**: Row-Level Security, immutable reference

### organizationId (String)

- **Type**: VARCHAR (e.g., `"demo-corp"`, `"acme-inc"`)
- **Purpose**: Human-readable organization identifier
- **Database**: `Organizations.organizationId` in app DB
- **Used for**: URLs, API queries, user-facing references

### orgId (Deprecated - Use organizationId)

- **Deprecated**: Use `organizationId` instead
- Previously used as shorter alias for `organizationId`
- **Resolved**: Issue #459 standardized all code to use `organizationId`
- All URL paths now use `/org/:organizationId/ideas`

### The Relationship

```text
br360_platform.tenants:
  id (UUID) = tenant_id
  org_id (VARCHAR) = "demo-corp"

business_review_db.Ideas:
  organizationId (VARCHAR) = "demo-corp" [Legacy, for URLs]
  tenant_id (UUID) = <matches tenants.id> [New, for RLS]
```

## 📊 How RLS Works

The application uses PostgreSQL Row-Level Security to isolate tenant data:

1. **Tenant Resolution** (middleware):

   ```javascript
   // Extract organizationId from request
   const organizationId = req.query.organizationId; // "demo-corp"

   // Look up tenant in platform DB
   const tenant = await getTenantByOrganizationId(organizationId);
   // Returns: { id: "uuid-here", org_id: "demo-corp", ... }

   req.tenant = tenant;
   // wrapTenantTransaction (registered globally on /api) opens a
   // request transaction and runs SET LOCAL app.tenant_id = req.tenant.id
   // before the route handler runs. RLS enforces inside that txn.
   ```

2. **RLS Enforcement**:

   ```sql
   -- Policy on Ideas table
   CREATE POLICY tenant_isolation_policy ON "Ideas"
     USING ("tenant_id"::text = current_setting('app.tenant_id', true));
   ```

3. **Result**:

   - Queries automatically filter by tenant_id
   - Each organization can only see their own data
   - Enforced at database level (not application level)

## ✅ Verification Commands

### Check Application Schema

```bash
# Verify tenant_id columns exist
docker exec business-review-360-db-1 psql -U business_review_user -d business_review_db -c "\d \"Ideas\""

# Should show: tenant_id, frequencyCount, frequencyPeriod
```

### Check Platform Schema

```bash
# Verify platform tables exist
docker exec business-review-360-db-1 psql -U business_review_user -d br360_platform -c "\dt"

# Should show: tenants, stripe_customers, stripe_subscriptions, sales_inquiries, audit_logs, pricing_plans, etc.
```

### Check RLS Status

```bash
# Verify RLS is enabled
docker exec business-review-360-db-1 psql -U business_review_user -d business_review_db -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Users', 'Ideas', 'Comments', 'Votes');"

# Should show: rowsecurity = true for all
```

## 📝 Summary

**For Fresh Deployments:**

- ✅ Use `db/clean_minimal_schema.sql` (includes everything)
- ✅ Use `db/platform_schema.sql` (includes everything)
- ✅ No migrations needed

**For Existing Production:**

- ⚠️ Use `db/migrations/CONSOLIDATED_001-006_app_database.sql`
- ⚠️ Platform DB migrations already in `platform_schema.sql`
- ⚠️ Always backup first!

**Migration Files:**

- Preserved in `db/migrations/` for reference
- Individual files available if granular control needed
- Consolidated file recommended for simplicity

---

**Last Updated**: 2025-11-08
**Related Issues**: #318 (Multi-Tenancy), #434 (Frequency Tracking), #459 (organizationId Standardization - Complete)
