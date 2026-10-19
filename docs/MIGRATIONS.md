# Schema Migrations

## Source of truth

SQL files in `db/migrations/app/` are the canonical schema definition for the app database. The Sequelize models in `backend/src/models/` must stay in sync with these files; the models are the runtime interface, the SQL files are the authoritative schema record.

`db/clean_minimal_schema.sql` is a legacy reference copy of the original combined schema. It is **not** used at runtime. Do not add new tables or columns there; add a new migration file instead.

## How it works

`backend/src/scripts/migrate.js` runs automatically on server startup (via `initializeServer()` in `backend/src/index.js`), before Sequelize's `syncDb()`. It:

1. Creates a `schema_migrations` table if it does not exist.
2. Reads all `.sql` files from `db/migrations/app/` in filename order.
3. Records and skips files already present in `schema_migrations`.
4. For existing databases with no migration records, detects the `Organizations` table and bootstraps all current files as applied (without re-running them), so the next genuinely new migration runs cleanly.

The runner can also be invoked standalone:

```bash
NODE_ENV=production node backend/src/scripts/migrate.js
```

## Adding a migration

1. Create a new file in `db/migrations/app/` with a zero-padded numeric prefix and a short descriptive name:

   ```
   db/migrations/app/0002-add-something.sql
   ```

2. Write idempotent SQL where possible (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). For destructive changes, wrap in a transaction:

   ```sql
   BEGIN;
   -- your changes
   COMMIT;
   ```

3. Deploy. The runner picks up the new file automatically on the next server start.

4. Do not update `docs/DATA_MODEL.md` by hand; it is a pointer, not a schema
   copy. The migrations in `db/migrations/app/` are the only schema record
   (a hand-maintained parallel copy went ten months stale and asserted a
   pre-multi-tenant schema; audit finding #931).

## Naming convention

```
NNNN-short-description.sql
```

- `NNNN`: zero-padded integer (0001, 0002, ...).
- `short-description`: lowercase, hyphens only.

## Production considerations

- The runner uses a direct `pg.Client` connection (not Sequelize) so it is independent of model definitions.
- Each migration file is recorded in `schema_migrations` only after it executes without error. A partial failure leaves the file unrecorded; fix the SQL and redeploy.
- The bootstrap path (existing DB, no recorded migrations) runs once per deployment to a pre-migration database and is a no-op on all subsequent starts.

## Fresh database bring-up (#871)

`docker-compose.yml` deliberately does NOT mount `db/clean_minimal_schema.sql` or `db/seed-data.sql` as Postgres initdb scripts. The app DB starts empty and `runMigrations` builds the canonical schema from `db/migrations/app/0001-baseline` on backend boot. This is the single source of truth and the only correct fresh-bootstrap path (the old initdb chain crashed on a fresh volume because `seed-data.sql` references post-0008 columns absent from the frozen `clean_minimal_schema.sql`, then `migrate.js` false-bootstrapped the ledger; the #857 divergence).

Existing volumes (prod, long-lived dev) are unaffected: Postgres runs initdb scripts only on an empty data directory.

On a genuinely fresh dev stack, the shared `demo-corp` fixture is no longer auto-seeded. After the backend has run migrations, apply it manually:

```
docker exec -i business-review-360-db-1 psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-data.sql
```

(`testing/global-setup.js` already does this for the e2e stack.)
