# Backend Tests

This folder contains all backend unit and integration tests.

**UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility**
- All tests updated for centralized error handling (Phase 6)
- Tests compatible with audit logging system (Phase 7)
- Test files documented with compatibility notes

## Test Files

- **`multiTenancySecurity.test.js`** - Multi-tenancy security tests for export, analytics, and categories endpoints
- **`profanityFilter.test.js`** - Profanity filter middleware tests
- **`MULTI_TENANCY_TESTS.md`** - Detailed documentation for multi-tenancy security tests

## Running Tests

**IMPORTANT**: Backend tests must be run from the `testing` directory with the correct JWT_SECRET environment variable.

From the project root:

```bash
# Run all backend tests
cd testing
export JWT_SECRET='test-secret-key-for-multi-tenancy-tests'
node --experimental-vm-modules node_modules/jest/bin/jest.js backend-tests

# Run specific test file
export JWT_SECRET='test-secret-key-for-multi-tenancy-tests'
node --experimental-vm-modules node_modules/jest/bin/jest.js backend-tests/multiTenancySecurity.test.js
node --experimental-vm-modules node_modules/jest/bin/jest.js backend-tests/profanityFilter.test.js

# Or run from backend directory (uses updated Jest config)
cd backend
npm test
```

### Why JWT_SECRET is required

The backend tests mock the User.findByPk method to work with in-memory test databases, but the real authenticate middleware still validates JWT tokens. The JWT_SECRET must match the secret used to sign test tokens.

## Test Structure

```
testing/backend-tests/
├── multiTenancySecurity.test.js   # Multi-tenancy security validation
├── profanityFilter.test.js        # Profanity filter unit tests
├── MULTI_TENANCY_TESTS.md         # Multi-tenancy test documentation
└── README.md                       # This file
```

## Adding New Tests

When adding new backend tests:

1. Create test file with `.test.js` extension
2. Place in this folder (`testing/backend-tests/`)
3. Use Jest/Supertest for HTTP endpoint tests
4. Follow existing patterns (see `multiTenancySecurity.test.js`)
5. Update this README with new test descriptions

## Test Configuration

Tests are configured in `backend/package.json`:
- Test runner: Jest
- HTTP testing: Supertest
- Database: SQLite in-memory (for isolated tests)

## Related Folders

- `testing/e2e/` - Frontend E2E tests (Playwright)
- `backend/src/routes/` - Backend route handlers being tested
- `backend/src/middleware/` - Middleware being tested
