# Multi-Tenancy Security Test Suite

**UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility**
- Tests work with centralized error handling (Phase 6 - Issue #335)
- Tests validate audit logging for admin actions (Phase 7 - Issue #338)
- Error responses include proper status codes and request IDs

## Overview

This test suite (`multiTenancySecurity.test.js`) validates that all admin endpoints properly isolate data between organizations, preventing cross-tenancy data leaks.

## Test Coverage

### 1. Export Endpoints (4 endpoints)
Tests that exports only include data from the requesting admin's organization:

- **GET /api/export/excel** - Excel export of ideas, comments, votes
- **GET /api/export/csv** - CSV export of ideas
- **GET /api/export/json** - JSON export with full details
- **GET /api/export/tickets** - Ticket system export format

**What's tested:**
- ✅ Org 1 admin only sees Org 1 data
- ✅ Org 2 admin only sees Org 2 data
- ✅ 403 error when user lacks organizationId

### 2. Analytics Endpoint (1 endpoint, 13+ data points)
Tests that analytics are scoped to the requesting admin's organization:

- **GET /api/analytics** - Comprehensive analytics dashboard data

**What's tested:**
- ✅ Total counts (ideas, users, comments, votes) per org
- ✅ Ideas by status breakdown per org
- ✅ Ideas by category breakdown per org
- ✅ Top ideas by votes per org
- ✅ User engagement metrics per org
- ✅ Ideas over time per org

### 3. Categories Endpoints (4 endpoints)
Tests that category operations are scoped to organizations:

- **GET /api/categories** - List categories
- **POST /api/categories** - Create category
- **PUT /api/categories/:id** - Update category
- **DELETE /api/categories/:id** - Delete category

**What's tested:**
- ✅ GET returns only org's categories
- ✅ POST creates with correct organizationId
- ✅ PUT blocks cross-org modifications (returns 403)
- ✅ DELETE blocks cross-org deletions (returns 403)

## Test Setup

The test suite creates two isolated organizations with test data:

### Organization 1
- ID: `11111111-1111-1111-1111-111111111111`
- Admin: org1admin
- User: org1user
- 1 Idea ("Org 1 Idea")
- 1 Comment
- 1 Vote
- 1 Category

### Organization 2
- ID: `22222222-2222-2222-2222-222222222222`
- Admin: org2admin
- User: org2user
- 1 Idea ("Org 2 Idea")
- 1 Comment
- 1 Vote
- 1 Category

## Running the Tests

```bash
# Run all tests
npm test

# Run only multi-tenancy security tests
npm test multiTenancySecurity

# Run with coverage
npm test -- --coverage
```

## Expected Results

All tests should **PASS** if multi-tenancy security is properly implemented:

- ✅ **27 passing tests** (when complete)
- ✅ Org 1 admins never see Org 2 data
- ✅ Org 2 admins never see Org 1 data
- ✅ Cross-org modification attempts blocked with 403
- ✅ Users without organizationId blocked with 403

## Test Database

- Uses **SQLite in-memory database**
- Clean slate before each test (via `beforeEach`)
- No external dependencies required
- Tests run in isolation

## Critical Security Validations

### ❌ Before Fixes (VULNERABLE)
```javascript
// Org 1 admin requests export
GET /api/export/csv
Authorization: Bearer org1AdminToken

// Response includes BOTH organizations:
"Org 1 Idea"  ← Should see this
"Org 2 Idea"  ← Should NOT see this! 🚨
```

### ✅ After Fixes (SECURE)
```javascript
// Org 1 admin requests export
GET /api/export/csv
Authorization: Bearer org1AdminToken

// Response includes ONLY Org 1:
"Org 1 Idea"  ← Correct ✓
// "Org 2 Idea" not present ✓
```

## Test Assertions

The tests verify:

1. **Data isolation**: Org 1 never sees Org 2 data
2. **Count accuracy**: Analytics show correct totals per org
3. **Modification blocking**: Cross-org updates/deletes return 403
4. **No data leaks**: Error messages don't reveal other org's data
5. **Proper filtering**: All queries include `where: { organizationId }`

## Edge Cases Covered

- Empty organization (no data)
- User without organizationId (returns 403)
- Non-existent categories from other orgs (returns 404, not 403)
- Categories with same name in different orgs
- Ideas with same category in different orgs

## Related Security Issues

This test suite validates fixes for:
- **Issue #XXX**: Export endpoints leaked cross-org data
- **Issue #XXX**: Analytics showed aggregate data across all orgs
- **Issue #XXX**: Categories endpoint returned all categories

## Adding New Tests

When adding new admin endpoints that query organization data:

1. Add the endpoint to this test suite
2. Test both Org 1 and Org 2 access
3. Verify cross-org access is blocked
4. Check that counts/lists are org-specific
5. Test edge cases (no organizationId, empty org)

## Test Structure

```javascript
describe('Multi-Tenancy Security - [Feature]', () => {
  describe('[HTTP Method] [endpoint]', () => {
    it('should only return/modify org 1 data for org 1 admin', async () => {
      // Test org 1 isolation
    });

    it('should only return/modify org 2 data for org 2 admin', async () => {
      // Test org 2 isolation
    });

    it('should prevent cross-org access with 403', async () => {
      // Test security boundary
    });
  });
});
```

## Continuous Security

Run these tests:
- ✅ Before every deployment
- ✅ In CI/CD pipeline
- ✅ After any changes to export/analytics/admin endpoints
- ✅ When adding new multi-tenant features

## Security Contact

If you discover a multi-tenancy vulnerability:
1. **DO NOT** create a public issue
2. Contact the security team directly
3. Reference this test suite in your report
4. Add a test case to prevent regression
