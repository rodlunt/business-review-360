# Row-Level Security (RLS) Operations Guide

## Overview

Business Review 360 uses PostgreSQL Row-Level Security (RLS) to enforce tenant isolation at the database level. This guide explains how the system works, how to run safe queries, and common operational procedures.

## Table of Contents

- [How RLS Works in BR360](#how-rls-works-in-br360)
- [How the App Sets tenant_id](#how-the-app-sets-tenant_id)
- [Running Ad Hoc Queries Safely](#running-ad-hoc-queries-safely)
- [Single Tenant Export](#single-tenant-export)
- [Disable Tenant Procedure](#disable-tenant-procedure)
- [Common Pitfalls](#common-pitfalls)
- [Troubleshooting](#troubleshooting)

## How RLS Works in BR360

### Architecture

```
┌─────────────┐
│   Request   │
└──────┬──────┘
       │
       v
┌─────────────────────────────────────────┐
│  Backend resolves tenant from:          │
│  - Subdomain (org1.br360.au)           │
│  - Path (/org/tradezone)               │
│  - JWT token (organizationId)          │
└──────┬──────────────────────────────────┘
       │
       v
┌─────────────────────────────────────────┐
│  Set session variable:                  │
│  SET LOCAL app.tenant_id = '<uuid>'    │
└──────┬──────────────────────────────────┘
       │
       v
┌─────────────────────────────────────────┐
│  All queries automatically filtered by  │
│  RLS policies checking:                 │
│  current_setting('app.tenant_id')      │
└─────────────────────────────────────────┘
```

### Protected Tables

The following tables have RLS enabled and require `tenant_id`:

- `Users` - User accounts
- `Ideas` - Business improvement ideas
- `Comments` - Comments on ideas
- `Votes` - Votes on ideas
- `CommentVotes` - Votes on comments
- `Categories` - Idea categories (tenant-specific)
- `OrganizationSettings` - Organization branding/settings

### RLS Policy Example

```sql
-- Example policy on Ideas table
CREATE POLICY tenant_isolation_policy ON "Ideas"
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Force RLS even for table owner
ALTER TABLE "Ideas" FORCE ROW LEVEL SECURITY;
```

## How the App Sets tenant_id

### Application Flow

1. **Request arrives** at backend with tenant context (subdomain, path, or JWT)

2. **Tenant resolver middleware** extracts the tenant ID:
   ```javascript
   // Pseudo-code
   const tenantId = await resolveTenant(req);
   req.tenantId = tenantId;
   ```

3. **Database connection** sets session variable before each query:
   ```javascript
   // Sequelize hook (or similar)
   await sequelize.query(
     `SET LOCAL app.tenant_id = '${tenantId}'`
   );
   ```

4. **All subsequent queries** in that transaction/session are automatically filtered by RLS

### Session Variable Scope

The `SET LOCAL` command ensures the setting only applies to the current transaction:

```sql
-- Setting applies only to this transaction
SET LOCAL app.tenant_id = '12345678-1234-1234-1234-123456789012';

-- Query is automatically filtered
SELECT * FROM "Ideas";  -- Only sees ideas for tenant 12345678-...

-- After COMMIT or ROLLBACK, the setting is cleared
```

## Running Ad Hoc Queries Safely

### IMPORTANT: Always Set tenant_id First

When running manual queries, you MUST set `app.tenant_id` or you'll see NO ROWS (RLS blocks everything).

### Safe Query Pattern

```sql
-- Start a transaction
BEGIN;

-- Set the tenant context
SET LOCAL app.tenant_id = '12345678-1234-1234-1234-123456789012';

-- Now run your queries
SELECT * FROM "Ideas" WHERE status = 'approved';

-- Commit when done
COMMIT;
```

### Finding Tenant IDs

```sql
-- List all tenants from platform database
SELECT
  org_id,
  tenant_id,
  plan,
  status,
  base_url
FROM br360_platform.tenants
ORDER BY created_at DESC;

-- Find tenant by organization slug
SELECT tenant_id
FROM br360_platform.tenants
WHERE org_id = 'tradezone';

-- Find tenant from user email (in app database)
SELECT DISTINCT tenant_id, email
FROM "Users"
WHERE email = 'admin@example.com';
```

### Read-Only Queries

```sql
-- Always use transactions for safety
BEGIN;

-- Set tenant context
SET LOCAL app.tenant_id = 'your-tenant-uuid-here';

-- Safe read-only query
SELECT
  id,
  title,
  status,
  "createdAt"
FROM "Ideas"
WHERE status = 'pending'
ORDER BY "createdAt" DESC
LIMIT 10;

COMMIT;
```

### Modifying Data

```sql
BEGIN;

-- Set tenant context
SET LOCAL app.tenant_id = 'your-tenant-uuid-here';

-- Update example
UPDATE "Ideas"
SET status = 'approved'
WHERE id = 'idea-uuid-here'
  AND status = 'pending';

-- Verify the change
SELECT id, title, status FROM "Ideas" WHERE id = 'idea-uuid-here';

-- Only commit if correct
COMMIT;
-- Or: ROLLBACK;
```

### Multi-Tenant Queries (Admin Only)

If you need to query across ALL tenants (rare, admin tasks only):

```sql
-- Connect as superuser or role with BYPASSRLS
-- DO NOT set app.tenant_id

-- Count ideas per tenant
SELECT
  tenant_id,
  COUNT(*) as idea_count
FROM "Ideas"
GROUP BY tenant_id
ORDER BY idea_count DESC;

-- Find duplicate slugs across tenants (should never happen)
SELECT
  slug,
  COUNT(*) as count
FROM "Ideas"
GROUP BY slug
HAVING COUNT(*) > 1;
```

## Single Tenant Export

### Export All Data for One Tenant

```sql
-- Set tenant context
BEGIN;
SET LOCAL app.tenant_id = 'target-tenant-uuid';

-- Export users
\copy (SELECT * FROM "Users") TO '/tmp/tenant_users.csv' CSV HEADER;

-- Export ideas
\copy (SELECT * FROM "Ideas") TO '/tmp/tenant_ideas.csv' CSV HEADER;

-- Export comments
\copy (SELECT * FROM "Comments") TO '/tmp/tenant_comments.csv' CSV HEADER;

-- Export votes
\copy (SELECT * FROM "Votes") TO '/tmp/tenant_votes.csv' CSV HEADER;

-- Export comment votes
\copy (SELECT * FROM "CommentVotes") TO '/tmp/tenant_commentvotes.csv' CSV HEADER;

COMMIT;
```

### Export Using pg_dump (Recommended)

For a complete export including schema:

```bash
# Export specific tenant's data
# Note: This requires custom function or post-processing

# Export entire database
pg_dump -h localhost -U postgres business_review_db > full_backup.sql

# Then filter for specific tenant in application layer
# or use the CSV method above
```

### JSON Export (Single Tenant)

```sql
BEGIN;
SET LOCAL app.tenant_id = 'target-tenant-uuid';

-- Export as JSON
SELECT json_build_object(
  'users', (SELECT json_agg(u) FROM "Users" u),
  'ideas', (SELECT json_agg(i) FROM "Ideas" i),
  'comments', (SELECT json_agg(c) FROM "Comments" c)
) AS tenant_export;

COMMIT;
```

## Disable Tenant Procedure

### Temporarily Disable a Tenant

```sql
-- Update tenant status in platform database
UPDATE br360_platform.tenants
SET
  status = 'disabled',
  disabled_at = NOW(),
  disabled_reason = 'Payment failure'
WHERE org_id = 'problematic-tenant';

-- Application will check status and reject requests
```

### Mark Tenant for Deletion

```sql
-- Set deletion flag
UPDATE br360_platform.tenants
SET
  status = 'pending_deletion',
  deletion_scheduled_at = NOW() + INTERVAL '7 days',
  deletion_reason = 'User requested account closure'
WHERE org_id = 'tenant-to-delete';

-- Background job will handle cleanup after grace period
```

### Hard Delete (DANGEROUS - Use with Caution)

```sql
-- BACKUP FIRST!
-- This cannot be undone

BEGIN;

-- Get the tenant_id
SELECT tenant_id FROM br360_platform.tenants WHERE org_id = 'tenant-to-delete';
-- Result: 12345678-1234-1234-1234-123456789012

-- Set context to that tenant
SET LOCAL app.tenant_id = '12345678-1234-1234-1234-123456789012';

-- Delete in correct order (respecting foreign keys)
DELETE FROM "CommentVotes";
DELETE FROM "Votes";
DELETE FROM "Comments";
DELETE FROM "Ideas";
DELETE FROM "Categories";
DELETE FROM "OrganizationSettings";
DELETE FROM "Users";

-- Remove from platform database
DELETE FROM br360_platform.stripe_subscriptions WHERE tenant_id = '12345678-1234-1234-1234-123456789012';
DELETE FROM br360_platform.stripe_customers WHERE tenant_id = '12345678-1234-1234-1234-123456789012';
DELETE FROM br360_platform.tenants WHERE tenant_id = '12345678-1234-1234-1234-123456789012';

-- Only commit if you're SURE
-- COMMIT;
ROLLBACK;  -- Safer default
```

## Common Pitfalls

### 1. Forgetting to Set tenant_id

**Problem:**
```sql
-- NO tenant_id set
SELECT * FROM "Ideas";
-- Returns: 0 rows (RLS blocks everything)
```

**Solution:**
```sql
BEGIN;
SET LOCAL app.tenant_id = 'your-tenant-uuid';
SELECT * FROM "Ideas";
COMMIT;
```

### 2. Using Wrong Connection/Role

**Problem:**
```sql
-- Connected as superuser (postgres)
SELECT * FROM "Ideas";
-- Returns: ALL ideas from ALL tenants (RLS bypassed!)
```

**Solution:**
- Use application role `br360_app` which CANNOT bypass RLS
- Or explicitly set tenant_id even as superuser

### 3. Mixing Transactions

**Problem:**
```sql
BEGIN;
SET LOCAL app.tenant_id = 'tenant-a';
SELECT * FROM "Ideas";  -- Sees tenant A data

-- DON'T DO THIS: Changing tenant mid-transaction
SET LOCAL app.tenant_id = 'tenant-b';
SELECT * FROM "Ideas";  -- Now sees tenant B data - CONFUSING!
COMMIT;
```

**Solution:**
- One tenant per transaction
- COMMIT and start a new transaction to switch tenants

### 4. Cached Connections

**Problem:**
- Connection pool reuses connections
- Previous tenant_id might still be set

**Solution:**
- Application MUST reset `app.tenant_id` on every request
- Use `SET LOCAL` (transaction-scoped) not `SET` (session-scoped)

### 5. Foreign Key Violations

**Problem:**
```sql
BEGIN;
SET LOCAL app.tenant_id = 'tenant-a';

-- This fails if the referenced user is in a different tenant
INSERT INTO "Ideas" (tenant_id, "userId", title, ...)
VALUES ('tenant-a', 'user-from-tenant-b', 'My Idea', ...);
-- ERROR: Foreign key violation
```

**Solution:**
- Ensure all referenced records belong to the same tenant
- Application should enforce this at the business logic level

### 6. NULL tenant_id

**Problem:**
```sql
-- Accidentally created without tenant_id
INSERT INTO "Ideas" (id, title, status, ...)
VALUES ('uuid', 'Test', 'draft', ...);
-- tenant_id is NULL - unreachable by any tenant!
```

**Solution:**
- Make `tenant_id NOT NULL` on all tenant tables
- Application always sets tenant_id on INSERT

## Troubleshooting

### "Cannot see any data" When Querying

**Cause:** No `app.tenant_id` set, or incorrect tenant ID

**Fix:**
```sql
-- Check current setting
SHOW app.tenant_id;
-- If empty, set it:
SET LOCAL app.tenant_id = 'correct-tenant-uuid';
```

### "RLS policy violated" Error

**Cause:** Trying to access data from a different tenant

**Check:**
```sql
-- See what tenant_id is set
SELECT current_setting('app.tenant_id', true);

-- Verify the record's tenant
SELECT id, tenant_id FROM "Ideas" WHERE id = 'problematic-idea-id';
```

### Cross-Tenant Data Leak Check

```sql
-- Connect as superuser to bypass RLS temporarily
-- Check for any orphaned or mis-tagged data

-- Find records with NULL tenant_id (should be zero)
SELECT COUNT(*) FROM "Ideas" WHERE tenant_id IS NULL;
SELECT COUNT(*) FROM "Users" WHERE tenant_id IS NULL;

-- Verify unique constraints work per-tenant
SELECT tenant_id, email, COUNT(*)
FROM "Users"
GROUP BY tenant_id, email
HAVING COUNT(*) > 1;

-- Should show no duplicates within same tenant
```

### Performance Issues

RLS policies add a `WHERE tenant_id = ...` to every query. Ensure indexes exist:

```sql
-- Check indexes
\d "Ideas"

-- Should see indexes like:
-- "Ideas_tenant_id_idx" btree (tenant_id)
-- "Ideas_tenant_id_slug_key" UNIQUE (tenant_id, slug)

-- If missing, add them:
CREATE INDEX ON "Ideas"(tenant_id);
CREATE UNIQUE INDEX ON "Ideas"(tenant_id, slug);
```

## Security Best Practices

### 1. Use Least-Privilege Roles

```sql
-- Application role (cannot bypass RLS)
CREATE ROLE br360_app WITH LOGIN PASSWORD 'secure-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO br360_app;

-- Migration role (can modify schema but still respects RLS)
CREATE ROLE br360_migration WITH LOGIN PASSWORD 'secure-password';
GRANT ALL ON SCHEMA public TO br360_migration;

-- Break-glass role (can bypass RLS - use sparingly!)
CREATE ROLE br360_breakglass WITH LOGIN PASSWORD 'secure-password' BYPASSRLS;
-- Only accessible from localhost/bastion
```

### 2. Audit Logging

```sql
-- Create audit log table
CREATE TABLE br360_platform.audit_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  role_name TEXT,
  query TEXT,
  tenant_id UUID,
  action TEXT
);

-- Grant insert only
GRANT INSERT ON br360_platform.audit_log TO br360_app;
```

### 3. Regular Audits

```bash
# Run weekly security audit
./scripts/security-audit-rls.sh

# Check for:
# - Records without tenant_id
# - Duplicate emails across tenants (should be unique per tenant)
# - Orphaned records (foreign keys to deleted tenants)
# - Index coverage on tenant_id columns
```

## Quick Reference

### Essential Commands

```sql
-- Set tenant context
BEGIN;
SET LOCAL app.tenant_id = 'tenant-uuid-here';

-- List all tenants
SELECT org_id, tenant_id, status FROM br360_platform.tenants;

-- Check current tenant setting
SHOW app.tenant_id;

-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- See active policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Export tenant data
\copy (SELECT * FROM "Ideas") TO '/tmp/ideas.csv' CSV HEADER;
```

### When Things Go Wrong

1. **Reset session:** `ROLLBACK;` or disconnect and reconnect
2. **Check tenant_id:** `SHOW app.tenant_id;`
3. **Verify data exists:** Query as superuser (carefully!)
4. **Check logs:** Application logs show which tenant was resolved
5. **Contact team:** Share the `X-Request-ID` from the request

## Additional Resources

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenancy Best Practices](https://www.citusdata.com/blog/2016/10/03/designing-your-saas-database-for-high-scalability/)
- Issue #318: Billing and Tenancy v1 Epic
- Issue #327: App DB migration A (tenant_id columns)
- Issue #328: App DB migration B (RLS policies)

## Document History

- **Created:** 2025-10-14 - Initial version for Billing and Tenancy v1 milestone
- **Status:** Living document - update as RLS implementation evolves
