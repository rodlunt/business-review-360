// Issue #561 Phase 1 + Issue #591: Postgres testcontainers fixture for
// integration tests that need real Postgres (RLS, ::jsonb casts, etc).
//
// Schema-loading decision (Issue #591): the fixture loads BOTH
//   - db/clean_minimal_schema.sql (tenant DB tables: Organizations, Users,
//     Ideas, Comments, Votes, Surveys, EmailQueue, etc -- PascalCase quoted)
//   - db/platform-schema.sql      (platform DB tables: tenants, audit_logs,
//     pricing_plans, stripe_*, sales_enquiries -- snake_case lowercase)
// into a SINGLE Postgres database (the testcontainer's default br360_test).
//
// Why one DB instead of two? A grep of CREATE TABLE statements across both
// schema files shows ZERO table-name collisions: tenant-DB tables are quoted
// PascalCase identifiers ("Organizations", "Users", "Ideas", ...) while
// platform-DB tables are lowercase snake_case (tenants, audit_logs, ...).
// Production splits them into two physical databases (PLATFORM_DATABASE_URL
// vs DATABASE_URL) for blast-radius and access-control reasons; for an
// integration harness whose only job is to exercise real SQL (jsonb casts,
// RLS policies, indexes), the physical split adds heft without fidelity.
// One container, one Sequelize instance, one connection pool keeps the
// pool.max=1 RLS invariant simple and cheap. If a future test genuinely
// needs the two-DB split (e.g. cross-database FK behaviour), revisit.
//
// Two-process model (Jest globalSetup vs workers):
//   - globalSetup process calls startPgContainer(): boots Postgres, loads
//     both schemas, publishes connection URI via process.env.PG_TEST_URI
//     (env vars set in globalSetup are inherited by Jest worker processes).
//   - Worker processes call getTestSequelize(): lazily creates a per-worker
//     Sequelize singleton against the same DB. pool.max=1 forces deterministic
//     connection reuse so RLS regressions surface inside a single test.
//   - globalTeardown stops the container.
//
// Each worker creates its own pool, but the goal of pool.max=1 is to force
// reuse of a single connection within one test (Phase 2's RLS assertions),
// not across workers -- workers run independent test files and never share a
// transaction.
//
// Opt-in: tests use this fixture by living under
// testing/backend-tests-integration/ (matched by jest.config.integration.js
// at the repo root, which also wires globalSetup/globalTeardown). Run with
// `npm run test:integration` from the repo root. The plain backend unit
// suite at testing/backend-tests/ does NOT boot the container.
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Sequelize } from "sequelize";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Phase 4 prerequisite: load the canonical schema by running the same
// ordered db/migrations/app/ runner prod uses, NOT the frozen legacy
// db/clean_minimal_schema.sql (which predates migration 0008 and so lacks
// isSuperuser / hasSeen*Walkthrough / primaryOrganizationId and every other
// post-freeze column). This makes the integration DB schema-faithful.
import { runMigrations } from "../../backend/src/scripts/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const POOL_OPTS = { max: 1, min: 0, acquire: 30000, idle: 10000 };

let container;
let sequelize;

export async function startPgContainer() {
  if (container) return { container, sequelize };

  container = await new PostgreSqlContainer("postgres:15")
    .withDatabase("br360_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const uri = container.getConnectionUri();
  process.env.PG_TEST_URI = uri;

  sequelize = new Sequelize(uri, {
    dialect: "postgres",
    logging: false,
    pool: POOL_OPTS,
  });

  // Tenant-DB schema first (Organizations, Users, Ideas, ...). Applied via
  // the canonical migration runner (0001-baseline.sql then 0002..NNNN in
  // filename order) against the fresh container. The runner uses its own
  // pg.Client and runs here while the `test` role still has SUPERUSER (the
  // NOSUPERUSER/NOBYPASSRLS drop below happens after), so DDL, role and RLS
  // policy creation in the migrations all succeed.
  await runMigrations(uri);

  // Platform-DB schema second (tenants, audit_logs, pricing_plans, ...).
  // Issue #591: required for the audit_logs jsonb-cast harness.
  const platformSchemaPath = path.join(repoRoot, "db", "platform-schema.sql");
  const platformSchemaSql = await fs.readFile(platformSchemaPath, "utf-8");
  await sequelize.query(platformSchemaSql);

  // Issue #702 follow-up: drop both SUPERUSER AND BYPASSRLS on the test role
  // so FORCE ROW LEVEL SECURITY actually applies. The bundled `postgres:15`
  // image initdb makes POSTGRES_USER (here, `test`) a cluster superuser AND
  // grants it BYPASSRLS. Postgres bypasses RLS entirely for any role with
  // either attribute, regardless of FORCE. The original #702 fix dropped
  // only SUPERUSER, which left BYPASSRLS in place and the bypass still
  // active. Without dropping both, RLS-protected SELECTs in tests see every
  // row whatever app.tenant_id is set to.
  // The Sequelize instance must be re-created because role-attribute changes
  // only take effect on new sessions; the existing pooled connection retains
  // its old privileges until reconnected.
  await sequelize.query("ALTER ROLE test NOSUPERUSER NOBYPASSRLS");
  await sequelize.close();
  sequelize = new Sequelize(uri, {
    dialect: "postgres",
    logging: false,
    pool: POOL_OPTS,
  });

  return { container, sequelize };
}

export async function stopPgContainer() {
  if (sequelize) await sequelize.close();
  if (container) await container.stop();
  container = undefined;
  sequelize = undefined;
}

export function getTestSequelize() {
  if (sequelize) return sequelize;
  const uri = process.env.PG_TEST_URI;
  if (!uri) {
    throw new Error(
      "PG_TEST_URI not set. Run via `npm run test:integration` so globalSetup starts the container."
    );
  }
  sequelize = new Sequelize(uri, {
    dialect: "postgres",
    logging: false,
    pool: POOL_OPTS,
  });
  return sequelize;
}
