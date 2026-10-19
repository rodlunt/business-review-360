# Testing Directory

This directory contains testing configuration and output files for the Business Review 360 application.

**UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8**
- All tests updated for new infrastructure compatibility
- 28 test files documented with Phase 6/7/8 notes
- New billing E2E tests added (14 scenarios)
- Backend tests compatible with error handling and audit logging

## Unlighthouse

Unlighthouse is used for comprehensive site scanning with Lighthouse to check performance, accessibility, best practices, and SEO across multiple pages.

### Setup

```bash
# Install unlighthouse globally
npm install -g @unlighthouse/cli puppeteer

# Or use npx (no installation required)
npx unlighthouse
```

### Usage

```bash
# Start the frontend dev server first
cd frontend && npm run dev

# In another terminal, run unlighthouse
npx unlighthouse --site http://localhost:5173

# Or use the configuration file
npx unlighthouse
```

### Configuration

The `unlighthouse.config.js` file in the root directory configures:
- Output directory: `./testing/unlighthouse`
- Site URL to scan
- Lighthouse options
- Routes to test

### Output

All unlighthouse reports are generated in `testing/unlighthouse/` and are ignored by git.

To view the report:
```bash
npx unlighthouse --site http://localhost:5173
# Opens a browser with the interactive report
```

## Test Types

### Backend Tests
Backend unit and integration tests are located in `testing/backend-tests/`:
- **Multi-tenancy security tests** - Validates data isolation between organizations
- **Profanity filter tests** - Tests content moderation middleware
- Run from backend: `cd backend && npm test`
- See: `testing/backend-tests/README.md`

### E2E Tests (Playwright)
End-to-end tests are located in `testing/e2e/`:
- Test results: `testing/test-results/` (ignored by git)
- Configuration: `playwright.config.js`
- Run: `npx playwright test`

### Coverage Reports
- Location: `coverage/` (ignored by git)
- Generate: `npm test -- --coverage`
