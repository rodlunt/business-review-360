/**
 * Issue #591 -- audit_logs jsonb integration test (real Postgres).
 *
 * Background: testing/backend-tests/auditLoggerMount.test.js spies on
 * AuditLog.create and never exercises the real INSERT. Production's INSERT
 * uses Postgres-specific `:changes::jsonb` and `:metadata::jsonb` casts
 * (backend/src/middleware/auditLog.js:54-77) that no other suite validates.
 * sqlite-in-memory cannot validate them, so a SQL-layer regression would
 * silently pass the unit suite.
 *
 * This test boots a real Postgres 15 testcontainer (via the shared fixture
 * extended in this PR to load db/platform-schema.sql), wires the production
 * AuditLog.create against it, and asserts:
 *   1. Real INSERT succeeds with a non-trivial nested metadata object.
 *   2. The JSON round-trips: read back the row and compare shape.
 *   3. NULL actor_id / tenant_id work (matches the failed-login path).
 *   4. The metadata column is queryable as real jsonb -- a query using
 *      `metadata @> '...'::jsonb` and `metadata->>'field'` returns the row.
 *      This last assertion would be impossible against sqlite, so green here
 *      proves the harness has fidelity that the unit suite does not.
 *
 * Note on placement: this file lives under testing/backend-tests-integration/
 * (matched by jest.config.integration.js at the repo root, which also wires
 * globalSetup/globalTeardown to boot the testcontainer). The original task
 * brief named testing/backend-tests/ but that directory is the unit-suite
 * root and has no globalSetup -- placing the file there would have made
 * every backend `npm test` run try (and fail) to dial a Postgres that was
 * never started. Location chosen to match analyticsRls.test.js precedent.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  jest,
} from "@jest/globals";
import { QueryTypes } from "sequelize";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

// auditLog.js imports `platformSequelize` from
// backend/src/models/platformDatabase.js, which on import asserts
// PLATFORM_DATABASE_URL is set and (in non-test mode) loads the prod .env.
// The integration jest config has no setupFiles, so we mock the module
// before dynamically importing auditLog.js -- mirrors the pattern used in
// testing/backend-tests-integration/analyticsRls.test.js.
jest.unstable_mockModule(
  "../../backend/src/models/platformDatabase.js",
  async () => ({
    platformSequelize: getTestSequelize(),
    queryPlatform: jest.fn(),
    testPlatformConnection: jest.fn().mockResolvedValue(true),
  })
);

// Logger uses an environment-driven structured logger; we don't care about
// its output here. Mock it to a no-op so we don't pollute test output and
// so the dynamic import doesn't pull in any unexpected transitive deps.
jest.unstable_mockModule("../../backend/src/utils/logger.js", async () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

const { AuditLog } = await import("../../backend/src/middleware/auditLog.js");

let sequelize;

beforeAll(async () => {
  sequelize = getTestSequelize();
  // Belt-and-braces: confirm the table exists before we depend on it.
  const [rows] = await sequelize.query(
    "SELECT to_regclass('public.audit_logs') AS tbl"
  );
  if (rows[0].tbl === null) {
    throw new Error(
      "audit_logs table not present -- platform schema did not load into the testcontainer. Check postgres-rls-fixture.js."
    );
  }
  // Clean slate -- the platform schema seeds demo-corp and pricing plans but
  // does NOT seed audit_logs, so a TRUNCATE is the cheapest reset.
  await sequelize.query("TRUNCATE TABLE audit_logs");
});

afterAll(async () => {
  // Container is stopped by globalTeardown. Nothing to clean up here.
});

describe("Issue #591 -- audit_logs jsonb integration", () => {
  it("real INSERT succeeds with nested metadata that exercises the ::jsonb cast", async () => {
    await AuditLog.create({
      action: "auth.login",
      actor_id: "11111111-1111-1111-1111-111111111111",
      actor_email: "alice@example.test",
      actor_role: "user",
      tenant_id: "33333333-3333-3333-3333-333333333303",
      resource_type: "user",
      resource_id: "11111111-1111-1111-1111-111111111111",
      changes: {
        before: { lastLoginAt: null },
        after: { lastLoginAt: "2026-05-01T00:00:00.000Z" },
      },
      metadata: {
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (test)",
        method: "POST",
        path: "/login",
        statusCode: 200,
        nested: {
          headers: ["x-request-id", "x-forwarded-for"],
          flags: { mfa: true, replay: false },
        },
      },
      status: "success",
      request_id: "44444444-4444-4444-4444-444444444444",
    });

    const [rows] = await sequelize.query(
      "SELECT COUNT(*)::int AS n FROM audit_logs WHERE actor_email = :email",
      {
        replacements: { email: "alice@example.test" },
        type: QueryTypes.RAW,
      }
    );
    expect(rows[0].n).toBe(1);
  });

  it("round-trips the metadata JSON shape unchanged", async () => {
    const metadata = {
      ip: "203.0.113.8",
      method: "POST",
      path: "/login",
      statusCode: 401,
      attempt: { count: 3, lockUntil: null },
      tags: ["enumeration-suspect", "rate-limited"],
    };
    const changes = {
      before: { failedLoginCount: 2 },
      after: { failedLoginCount: 3 },
    };

    await AuditLog.create({
      action: "auth.login",
      actor_id: null,
      actor_email: "bob@example.test",
      actor_role: "user",
      tenant_id: null,
      resource_type: null,
      resource_id: null,
      changes,
      metadata,
      status: "failure",
      request_id: null,
    });

    const rows = await sequelize.query(
      "SELECT metadata, changes FROM audit_logs WHERE actor_email = :email",
      {
        replacements: { email: "bob@example.test" },
        type: QueryTypes.SELECT,
      }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual(metadata);
    expect(rows[0].changes).toEqual(changes);
  });

  it("accepts NULL actor_id and tenant_id (failed-login anonymous case)", async () => {
    await AuditLog.create({
      action: "auth.login",
      actor_id: null,
      actor_email: "anonymous",
      actor_role: "user",
      tenant_id: null,
      resource_type: null,
      resource_id: null,
      changes: null,
      metadata: { ip: "203.0.113.9", method: "POST", path: "/login", statusCode: 401 },
      status: "failure",
      request_id: null,
    });

    const rows = await sequelize.query(
      `SELECT actor_id, tenant_id, status FROM audit_logs
       WHERE actor_email = 'anonymous' AND status = 'failure'
       ORDER BY created_at DESC LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBeNull();
    expect(rows[0].tenant_id).toBeNull();
    expect(rows[0].status).toBe("failure");
  });

  it("metadata is queryable as real jsonb (would FAIL on sqlite, PASSES on Postgres)", async () => {
    // Two operators that only Postgres jsonb supports:
    //   metadata @> '{"path":"/login"}'::jsonb  -- containment
    //   metadata->>'method' = 'POST'            -- field extraction
    // Sqlite has no jsonb type and no @> operator; this query proves the
    // harness exercises a code path the unit suite cannot reach.
    const rows = await sequelize.query(
      `SELECT actor_email
         FROM audit_logs
        WHERE metadata @> '{"path":"/login"}'::jsonb
          AND metadata->>'method' = 'POST'
        ORDER BY actor_email`,
      { type: QueryTypes.SELECT }
    );
    const emails = rows.map((r) => r.actor_email).sort();
    // alice + bob + anonymous from the three preceding tests.
    expect(emails).toEqual(["alice@example.test", "anonymous", "bob@example.test"]);
  });
});
