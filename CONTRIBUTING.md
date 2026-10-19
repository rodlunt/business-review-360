# Contributing

This project is retired and the repository is archived, so nothing here is reviewed or merged.
The licence is MIT: fork it and take it wherever you like.

## Working on a fork

The project is a pnpm workspace (`backend/`, `frontend/`) with a Postgres database. You need
Docker, Node.js 22 or later and [pnpm](https://pnpm.io/).

```sh
git clone https://github.com/rodlunt/business-review-360
cd business-review-360
cp .env.example .env
pnpm install --frozen-lockfile
```

The checks CI runs, so run them locally before pushing:

```sh
pnpm --filter business-review-frontend run lint
pnpm --filter business-review-backend run lint
pnpm --filter business-review-frontend run format:check
pnpm --filter business-review-backend run format:check
pnpm --filter business-review-backend test
pnpm run test:integration:ci            # needs Docker (Testcontainers)
pnpm --filter business-review-frontend run test:run
pnpm --filter business-review-frontend run build
pnpm audit --audit-level=high
```

The Playwright end-to-end suite lives in `testing/` and needs the Docker stack running
(`pnpm test`).

## Conventions the codebase follows

- Conventional commit messages (`fix:`, `feat:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`).
- A pull request names the test or check that proves the change works.
- Tenant data is isolated by PostgreSQL row-level security. A new tenant-scoped table needs a
  policy and a test that proves one tenant cannot read another's rows (see `docs/ops-rls.md`).
