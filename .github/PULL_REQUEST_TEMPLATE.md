## What and why

<!-- What changed, and the reason it needed to. -->

Closes #

## Verification

<!-- Name the artefact that proves this works: the test file, the manual check
     performed, or the metric observed. "Ran it locally" alone is not verification. -->

## Checks

- [ ] `pnpm --filter business-review-frontend run lint` and `pnpm --filter business-review-backend run lint` pass
- [ ] `pnpm --filter business-review-frontend run format:check` and `pnpm --filter business-review-backend run format:check` pass
- [ ] `pnpm --filter business-review-backend test` passes
- [ ] `pnpm run test:integration:ci` passes (real Postgres/Testcontainers)
- [ ] `pnpm --filter business-review-frontend run test:run` and `pnpm --filter business-review-frontend run build` pass
- [ ] Relevant Playwright e2e specs pass locally where the change touches a covered flow
- [ ] Commits follow conventional commits (`fix:`, `feat:`, `chore:`, ...) with the why in the body
