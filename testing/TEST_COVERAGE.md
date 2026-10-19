# Test Coverage Map

This repo has four test tiers. Keep each tier focused so coverage grows without
duplicating the same workflow in three places.

## Backend unit and route tests

- Location: `testing/backend-tests/`
- Command: `cd backend && pnpm test`
- CI: `.github/workflows/ci.yml` job `Backend (Jest)`

Use this tier for route auth, validation, authorization, tenant guards, service
branches, model-level behavior, and regression tests that can use mocks or
SQLite. Prefer backend tests over E2E tests for CRUD edge cases and security
branch coverage.

## Backend integration tests

- Location: `testing/backend-tests-integration/`
- Command: `pnpm run test:integration`
- CI: `.github/workflows/ci.yml` job `Backend integration (Postgres/Testcontainers)`

Use this tier when behavior depends on real Postgres features, especially RLS,
JSONB casts, locks, indexes, and cross-tenant query enforcement. These tests
start a Postgres Testcontainer, so they should stay narrower than the backend
unit suite.

## Frontend component and hook tests

- Location: `frontend/src/**/__tests__/` and `frontend/src/**/*.test.jsx`
- Commands:
  - `cd frontend && pnpm run test:run`
  - `cd frontend && pnpm run test:coverage`
- CI: `.github/workflows/ci.yml` job `Frontend (Vitest + build)`

Use this tier for state transitions, hooks, routing decisions, form behavior,
empty/loading/error states, and accessibility-friendly DOM assertions. Prefer
component tests over Playwright for frontend-only branching.

## E2E smoke and golden paths

- Location: `testing/e2e/`
- Commands:
  - `pnpm test`
  - `pnpm run test:e2e:smoke`

Use E2E for full-stack confidence, browser behavior, tenant routing, and a small
set of golden paths. Avoid repeating every backend CRUD and validation branch
here; cover those branches in backend tests and keep E2E focused on whether the
system works when assembled.

The smoke script intentionally includes only compact browser-facing specs:
`00-basic-smoke`, `02-idea-management`, `06-security-authorization`, and
`19-ideas-pagination`.

## Redundancy guidance

- Keep detailed authorization matrices in backend tests. Add only one or two E2E
  checks that prove the browser gets the right redirect or blocked state.
- Keep pagination, sorting, and filtering edge cases in backend and hook tests.
  E2E should cover the visible workflow once.
- Avoid E2E tests that only wait for navigation or assert that mocked setup ran.
  They add runtime without protecting behavior.
- Add coverage for currently cold backend routes before expanding long Playwright
  scenarios: OAuth, consultants, internal routes, plan limits, and background
  jobs were notable low-coverage areas in the first pass.
- Remove or rewrite E2E tests that say the behavior cannot be tested, return
  early instead of asserting, or only prove that setup data is visible.
