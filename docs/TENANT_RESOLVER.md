# Tenant Resolver Middleware

**Issue:** [#330 - Backend tenant resolver and Sequelize context](https://github.com/rodlunt/business-review-360/issues/330)
**Epic:** [#318 - Billing and Tenancy v1](https://github.com/rodlunt/business-review-360/issues/318)

---

## Overview

The **Tenant Resolver** is Express middleware that:
1. Resolves which tenant (organization) a request belongs to
2. Queries the platform database for tenant details
3. Sets PostgreSQL tenant context for Row-Level Security (RLS)
4. Verifies users can only access their own tenant's data

This is **the critical piece** that makes multi-tenant RLS work!

---

## How It Works

### Request Flow

```
1. User makes request → /api/ideas?organizationId=tradezone
                    ↓
2. authenticate middleware → Validates JWT, sets req.user
                    ↓
3. resolveTenant middleware → Queries platform DB for tenant
                    ↓
4. Check tenant status → Must be "active"
                    ↓
5. Verify user/tenant match → req.user.organizationId === orgId
                    ↓
6. wrapTenantTransaction middleware → Opens a transaction and runs
                                      SET LOCAL app.tenant_id = :tid
                    ↓
7. Route handler → Query executes inside the transaction with RLS
                   filtering by tenant_id
```

> **#561 update:** the legacy `set_tenant_context()` SQL helper used
> session-level `set_config(..., false)` and was the cross-tenant leak
> vector. It was dropped in PR closing #561; tenant context is now set
> transaction-locally by `wrapTenantTransaction`. See
> `backend/src/middleware/wrapTenantTransaction.js`.

### What RLS Does

Once `wrapTenantTransaction` has run `SET LOCAL app.tenant_id = :tid`
inside the request transaction:

```sql
-- This query AUTOMATICALLY filters by tenant_id
SELECT * FROM "Ideas";

-- Behind the scenes, RLS converts it to:
SELECT * FROM "Ideas" WHERE tenant_id = current_setting('app.tenant_id')::uuid;
```

**Users can't see other tenants' data even with SQL injection!**

---

## Usage

### Basic Setup (Already Done)

The tenant resolver is registered in `backend/src/index.js`:

```javascript
import { resolveTenant, requireTenant } from "./middleware/tenantResolver.js";

// Apply to ALL API routes
app.use("/api", resolveTenant);

// Routes that MUST have tenant context
app.use("/api/ideas", requireTenant, ideaRoutes);
app.use("/api/comments", requireTenant, commentRoutes);
app.use("/api/votes", requireTenant, voteRoutes);

// Routes that don't need tenant (public/auth)
app.use("/api/auth", authRoutes);         // No requireTenant
app.use("/api/health", healthRoute);       // No requireTenant
```

### Middleware Options

#### `resolveTenant`
- Tries to resolve tenant from request
- If orgId found, queries platform DB and sets context
- If orgId NOT found, skips gracefully (allows /health, /login, etc.)
- Use on: ALL /api routes

#### `requireTenant`
- Requires that tenant was resolved (req.tenant exists)
- Returns 400 error if no tenant context
- Use on: Data routes that MUST have tenant (ideas, comments, votes)

---

## Tenant Resolution Sources

The middleware checks multiple places for organization ID (in order):

### 1. Path Parameters (Preferred)
```
GET /api/org/tradezone/ideas
    ↓
req.params.orgId = "tradezone"
```

### 2. Query String
```
GET /api/ideas?organizationId=tradezone
    ↓
req.query.organizationId = "tradezone"
```

### 3. Request Body
```
POST /api/ideas
{ "organizationId": "tradezone", "title": "..." }
    ↓
req.body.organizationId = "tradezone"
```

### 4. Authenticated User (Fallback)
```
Authorization: Bearer <jwt>
JWT payload: { id: "user-id", organizationId: "tradezone" }
    ↓
req.user.organizationId = "tradezone"
```

---

## Request Context

After `resolveTenant` runs successfully:

```javascript
// In any route handler:
router.get('/ideas', async (req, res) => {
  // req.tenant is populated
  console.log(req.tenant);
  // {
  //   id: "uuid-for-tenant",
  //   org_id: "tradezone",
  //   tenant_name: "Tradezone",
  //   plan: "pro",
  //   status: "active",
  //   limits: { maxIdeas: 500, maxUsers: 50, maxStorage: 5368709120 }
  // }

  // PostgreSQL context is set
  // All queries automatically filtered by tenant_id

  const ideas = await Idea.findAll();  // Only returns this tenant's ideas!
});
```

---

## Security Features

### 1. Tenant Status Check

Only active tenants can access the app:

```javascript
if (tenant.status !== "active") {
  return res.status(403).json({
    error: "This organization is not active",
    code: "TENANT_NOT_ACTIVE",
    status: tenant.status  // "suspended", "cancelled", "expired"
  });
}
```

Possible statuses:
- `pending` - Tenant created, awaiting payment
- `active` - Normal access ✅
- `suspended` - Payment failed, access blocked
- `cancelled` - Subscription cancelled
- `expired` - Trial or subscription expired

### 2. User/Tenant Verification

Prevents users from accessing other tenants:

```javascript
// User logged in as tenant A tries to access tenant B's data
if (req.user.organizationId !== organizationId) {
  return res.status(403).json({
    error: "You do not have access to this organization's data",
    code: "TENANT_ACCESS_DENIED"
  });
}
```

### 3. Database-Level Isolation (RLS)

Even if middleware is bypassed, RLS protects data:

```sql
-- User somehow bypasses middleware and executes:
SELECT * FROM "Ideas";

-- RLS policy blocks it (no tenant context set):
-- Result: 0 rows (empty set)

-- SQL injection attempt:
SELECT * FROM "Ideas" WHERE title = 'x' OR tenant_id IS NOT NULL;

-- RLS policy still blocks:
-- Result: 0 rows (RLS filters BEFORE the WHERE clause)
```

---

## Caching

Tenant lookups are cached for **5 minutes** to reduce platform DB queries.

### Cache Behavior

```javascript
// First request for "tradezone":
resolveTenant → Query platform DB → Cache result

// Subsequent requests (within 5 minutes):
resolveTenant → Return from cache (no DB query)

// After 5 minutes:
resolveTenant → Query platform DB again → Update cache
```

### Cache Management

```javascript
import { clearTenantCache, getTenantCacheStats } from "./middleware/tenantResolver.js";

// Clear cache (useful after tenant updates)
clearTenantCache();

// Get cache statistics
const stats = getTenantCacheStats();
console.log(stats);
// {
//   size: 3,
//   entries: [
//     { organizationId: "tradezone", age: 45000, tenantName: "Tradezone" },
//     { organizationId: "acme", age: 120000, tenantName: "ACME Corp" },
//     { organizationId: "tesla", age: 180000, tenantName: "Tesla" }
//   ]
// }
```

---

## Error Responses

### Tenant Not Found (404)

```json
{
  "error": "Organization not found",
  "code": "TENANT_NOT_FOUND"
}
```

**Cause:** Organization doesn't exist in platform database

### Tenant Not Active (403)

```json
{
  "error": "This organization is not active. Please contact support.",
  "code": "TENANT_NOT_ACTIVE",
  "status": "suspended"
}
```

**Cause:** Tenant status is not "active" (suspended, cancelled, etc.)

### Tenant Access Denied (403)

```json
{
  "error": "You do not have access to this organization's data.",
  "code": "TENANT_ACCESS_DENIED"
}
```

**Cause:** User's organizationId doesn't match requested tenant

### Tenant Required (400)

```json
{
  "error": "Organization context required",
  "code": "TENANT_REQUIRED"
}
```

**Cause:** Route requires tenant but none was resolved

### Tenant Resolution Error (500)

```json
{
  "error": "Failed to resolve tenant",
  "code": "TENANT_RESOLUTION_ERROR"
}
```

**Cause:** Platform database query failed

---

## Testing

### Test Tenant Resolution

```bash
# With path parameter (preferred)
curl http://localhost:4000/api/org/tradezone/ideas \
  -H "Authorization: Bearer <jwt>"

# With query parameter
curl http://localhost:4000/api/ideas?organizationId=tradezone \
  -H "Authorization: Bearer <jwt>"

# With body (POST/PUT)
curl -X POST http://localhost:4000/api/ideas \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "tradezone", "title": "Test Idea", ...}'
```

### Test Tenant Isolation

```javascript
// Login as User A (tenant: tradezone)
const userA = await login("usera@tradezone.com", "password");

// Login as User B (tenant: acme)
const userB = await login("userb@acme.com", "password");

// User A can see tradezone ideas
GET /api/org/tradezone/ideas
Authorization: Bearer <userA.token>
// Result: [tradezone ideas]

// User A CANNOT see acme ideas
GET /api/org/acme/ideas
Authorization: Bearer <userA.token>
// Result: 403 Tenant Access Denied

// User B can see acme ideas
GET /api/org/acme/ideas
Authorization: Bearer <userB.token>
// Result: [acme ideas]

// User B CANNOT see tradezone ideas
GET /api/org/tradezone/ideas
Authorization: Bearer <userB.token>
// Result: 403 Tenant Access Denied
```

### Test RLS Enforcement

```sql
-- Connect to database
psql -U business_review_user -d business_review_db

-- Without tenant context (simulates bypass attempt). Run as a NON-superuser
-- role with NOBYPASSRLS, e.g. br360_app_user, otherwise RLS is bypassed.
SET ROLE br360_app_user;
RESET app.tenant_id;
SELECT COUNT(*) FROM "Ideas";
-- Result: 0 (RLS blocks all rows)

-- With tenant context (normal request, transaction-local).
BEGIN;
  SET LOCAL ROLE br360_app_user;
  SET LOCAL app.tenant_id = '<tenant-uuid>';
  SELECT COUNT(*) FROM "Ideas";
  -- Result: Count of ideas for that tenant only
COMMIT;
```

---

## Monitoring

### Log Messages

The tenant resolver logs at key points:

```
[TenantResolver] Processing request: GET /api/ideas
[TenantResolver] orgId from query: tradezone
[TenantResolver] Cache hit for org: tradezone
[TenantResolver] Tenant context set: uuid-here
[TenantResolver] Tenant resolved: Tradezone (uuid-here)
```

### Watch For

- ⚠️ `Cache miss` - Lots of cache misses indicate cache TTL too short
- ⚠️ `Tenant not found` - Invalid orgId in requests
- ⚠️ `Tenant not active` - Suspended/cancelled tenants trying to access
- ⚠️ `User/tenant mismatch` - Possible security issue or bug
- ❌ `Failed to resolve tenant` - Platform DB connection issue

---

## Performance

### Typical Request Times

| Scenario | Time | Notes |
|----------|------|-------|
| Cache hit | ~1ms | No DB query needed |
| Cache miss | ~10-50ms | Query platform DB |
| RLS overhead | ~1-5ms | Per query |

### Optimization Tips

1. **Use path parameters** (`/org/:organizationId/...`) when possible - more explicit
2. **Cache is automatic** - no manual cache management needed
3. **Connection pooling** - Platform DB uses connection pool (max 5)
4. **Index on org_id** - Platform DB has index on `tenants.org_id`

---

## Troubleshooting

### Problem: "Tenant not found" for existing organization

**Check:**
```sql
-- App DB
SELECT "organizationId", "organizationName" FROM "Organizations";

-- Platform DB
SELECT org_id, tenant_name FROM tenants;

-- Do they match?
```

**Solution:** Create missing tenant in platform DB

### Problem: routes return zero rows from tenant tables

**Check that wrapTenantTransaction is registered globally on /api**
(`backend/src/index.js`) and that `app.tenant_id` is set inside the
request transaction:

```sql
-- Inside an active request transaction (or simulate one),
-- the GUC must be set:
SHOW app.tenant_id;
-- Result: the tenant UUID for the current request
```

If `app.tenant_id` is NULL or unset, RLS denies every row. Confirm the
request reached `wrapTenantTransaction` (look for the
`✅ wrapTenantTransaction registered (global: /api)` boot log) and that
`req.tenant` was populated by `resolveTenant` for the request path.

### Problem: Queries return 0 rows after enabling RLS

**Check:**

```sql
-- Is tenant context set inside the request transaction?
SHOW app.tenant_id;
-- Should return a UUID

-- Are RLS policies enabled?
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('Ideas', 'Users', 'Comments');
-- Should show rowsecurity = true
```

**Solution:** Ensure both `resolveTenant` and `wrapTenantTransaction`
middleware run before route handlers (registered globally on `/api` in
`backend/src/index.js`).

### Problem: User can see other tenant's data

**Check:**
1. Is `resolveTenant` registered before routes?
2. Is `requireTenant` on data routes?
3. Is RLS enabled? (`ALTER TABLE "Ideas" ENABLE ROW LEVEL SECURITY`)
4. Is RLS forced? (`ALTER TABLE "Ideas" FORCE ROW LEVEL SECURITY`)

**Solution:** Verify middleware order and RLS configuration

---

## Related Documentation

- [Control Plane Database](./CONTROL_PLANE_DATABASE.md)
- Organizations Deprecation
- Migration 002 Testing Guide
- [Issue #330](https://github.com/rodlunt/business-review-360/issues/330)
- [Epic #318](https://github.com/rodlunt/business-review-360/issues/318)

---

## Next Steps

After implementing tenant resolver:

1. **Test locally** - Apply migrations and test tenant isolation
2. **Issue #331** - Reserved orgId validation
3. **Issue #323-324** - Stripe billing integration
4. **Phase 4** - Billing endpoints

---

**Status:** Issue #330 Implementation Complete
**Last Updated:** 2025-10-27
