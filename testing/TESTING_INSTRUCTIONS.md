# Testing Instructions - Epic #318

## Quick Test Execution Guide

### Prerequisites

✅ **Already Done:**
- Playwright installed (`npm install` completed)
- 25 E2E tests written (14 billing + 11 auth)
- Test configuration ready

⚠️ **Need to Start:**
- Database (PostgreSQL)
- Backend API (port 4000)
- Frontend app (port 3000)

---

## Step-by-Step Test Execution

### 1. Start Services

**Terminal 1 - Database:**
```bash
docker-compose up -d db
```

**Terminal 2 - Backend:**
```bash
cd backend
npm install  # if not already done
npm run dev  # starts on port 4000
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm install  # if not already done
npm run dev  # starts on port 3000
```

**Verify services are running:**
```bash
# Check backend health
curl http://localhost:4000/health

# Check frontend (should return HTML)
curl http://localhost:3000
```

---

### 2. Run Tests (Terminal 4)

**Run all tests:**
```bash
npm test
```

**Run specific test suites:**
```bash
# Authentication tests (11 scenarios)
npm test testing/e2e/01-authentication.spec.js

# NEW Billing tests (14 scenarios)
npm test testing/e2e/14-billing-purchase-flow.spec.js

# Basic smoke test
npm test testing/e2e/00-basic-smoke.spec.js
```

**Run with browser visible (helpful for debugging):**
```bash
npm run test:headed testing/e2e/14-billing-purchase-flow.spec.js
```

**Run with Playwright UI (best for development):**
```bash
npm run test:ui
```

**Run a single test by name:**
```bash
npm test -- --grep "should display pricing page"
```

---

## Test Coverage Summary

### Authentication Tests (01-authentication.spec.js)
11 test scenarios covering:
- ✅ User registration with validation
- ✅ User login with credentials
- ✅ Session persistence across refresh
- ✅ Password reset flow
- ✅ Logout functionality
- ✅ Superuser setup
- ✅ Duplicate username rejection
- ✅ Invalid credentials handling

### Billing Tests (14-billing-purchase-flow.spec.js) - NEW
14 test scenarios covering:
- ✅ Pricing page display and navigation
- ✅ Monthly/yearly toggle
- ✅ Free plan signup flow
- ✅ Stripe checkout redirect
- ✅ Authentication requirement for paid plans
- ✅ Contact sales modal and submission
- ✅ Payment success page
- ✅ Payment cancel page
- ✅ Plan limits display in admin
- ✅ Upgrade CTA visibility
- ✅ Billing API endpoints
- ✅ Navigation from admin to pricing

**Total: 25 E2E test scenarios**

---

## Expected Results

### When Services Are Running:
- ✅ All 25 tests should pass
- ⚠️ Some tests may need Stripe test mode configured
- ⏱️ Execution time: ~5-7 minutes

### Common Issues:

**Issue: "Error: page.goto: net::ERR_CONNECTION_REFUSED"**
- **Cause**: Services not running
- **Fix**: Start backend (port 4000) and frontend (port 3000)

**Issue: "Timeout waiting for element"**
- **Cause**: Database not initialized or slow startup
- **Fix**: Ensure database is running and populated

**Issue: "404 Not Found"**
- **Cause**: Backend routes not registered
- **Fix**: Ensure latest code is running (git pull)

---

## Quick Test Commands

```bash
# Full test suite (requires all services)
npm test

# Single test file (faster)
npm test testing/e2e/14-billing-purchase-flow.spec.js

# With browser UI (see what's happening)
npm run test:headed testing/e2e/14-billing-purchase-flow.spec.js

# Interactive mode (best for debugging)
npm run test:ui

# Specific test by name
npm test -- --grep "should display pricing page"
```

---

## Test Reports

After running tests, reports are generated in:
- `testing/playwright-report/` - HTML report
- `testing/test-results/` - JSON results and screenshots

**View HTML report:**
```bash
npx playwright show-report testing/playwright-report
```

---

## CI/CD Integration

Tests can be integrated into GitHub Actions:

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm ci

      - name: Start services
        run: |
          docker-compose up -d db
          cd backend && npm ci && npm run dev &
          cd frontend && npm ci && npm run dev &
          sleep 30

      - name: Run tests
        run: npm test

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: testing/playwright-report/
```

---

## Next Steps After Testing

Once all tests pass:

1. ✅ **Code Review**: Review all changes in `feature/billing-tenancy-v1`
2. ✅ **Manual Testing**: Test critical flows manually
3. ✅ **Run Migrations**: Apply migrations 004 and 005
4. ✅ **Create PR**: Merge feature branch to main
5. ✅ **Deploy Staging**: Test in staging environment
6. ✅ **Deploy Production**: Deploy with monitoring

---

## Test Files Location

- **Config**: `testing/playwright.config.js`
- **Helpers**: `testing/e2e/test-helpers.js`
- **Auth Tests**: `testing/e2e/01-authentication.spec.js`
- **Billing Tests**: `testing/e2e/14-billing-purchase-flow.spec.js`
- **All Tests**: `testing/e2e/` (20 test files total)

---

## Troubleshooting

### Database Connection Issues
```bash
# Check if database is running
docker ps | grep postgres

# Restart database
docker-compose restart db

# Check logs
docker-compose logs db
```

### Backend Issues
```bash
# Check if backend is running
curl http://localhost:4000/health

# Should return: {"status":"ok","timestamp":"...","uptime":123}

# Check backend logs
cd backend
npm run dev  # See console output
```

### Frontend Issues
```bash
# Check if frontend is running
curl http://localhost:3000

# Should return HTML content

# Check frontend console
cd frontend
npm run dev  # See console output
```

---

## Status: Ready to Test

✅ **Playwright installed** (npm install completed)
✅ **Tests written** (25 scenarios)
✅ **Configuration ready**
✅ **All code committed and pushed**

⏳ **Pending**: Start services and run tests

---

**Created:** November 5, 2025
**Epic:** #318 - Billing and Tenancy v1 (100% Complete)
**Branch:** feature/billing-tenancy-v1
