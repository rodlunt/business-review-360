/**
 * Issue #561 Phase 2 -- analyticsRls integration test.
 *
 * Proves wrapTenantTransaction enforces RLS isolation when exercised against
 * a real Postgres with `pool: { max: 1 }` (forces connection reuse so leaks
 * surface deterministically). The test does NOT mount /api/analytics; it
 * exercises the wrapper directly with a minimal Express app and a small
 * tenant-scoped read handler. The analytics route is the first migration
 * target, so this test name pins the contract that the migration must hold.
 *
 * Three cases per spec section 9 + plan Phase 2 Step 4:
 *   1. Tenant A request reads only A's data.
 *   2. Pool reuse: A then B on the same connection sees only own data.
 *   3. After a wrapped request, a bare query on the same connection sees
 *      zero rows -- proves SET LOCAL is transaction-local and clears at
 *      commit (does not bleed into the next request on the reused
 *      connection).
 *
 * Spec: docs/superpowers/specs/2026-04-29-561-tenant-tx-wrapper-design.md
 * Plan: docs/superpowers/plans/2026-04-29-561-tenant-tx-wrapper-plan.md
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  jest,
} from "@jest/globals";
import express from "express";
import request from "supertest";
import { Sequelize } from "sequelize";
// cls-hooked is a backend dep; resolve from there so the test exercises the
// same Sequelize CLS plumbing the production wrapper relies on.
import cls from "../../backend/node_modules/cls-hooked/index.js";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

// Activate CLS BEFORE the mocked database.js is consumed. Sequelize.useCLS is
// a static method: once called, every Sequelize instance (including the test
// fixture's) participates. This mirrors what backend/src/models/database.js
// does at module load in production.
const namespace = cls.createNamespace("br360-tenant-tx");
Sequelize.useCLS(namespace);

// Mock database.js so the wrapper's `import { sequelize } from "../models/database.js"`
// resolves to the testcontainers instance with pool.max=1. Mock must register
// before the wrapper is dynamically imported below.
jest.unstable_mockModule(
  "../../backend/src/models/database.js",
  async () => ({
    sequelize: getTestSequelize(),
    namespace,
  })
);

const tenantAId = "11111111-1111-1111-1111-111111111111";
const tenantBId = "22222222-2222-2222-2222-222222222222";
const orgAHandle = "org-a-561-phase-2";
const orgBHandle = "org-b-561-phase-2";

let sequelize;
let app;

beforeAll(async () => {
  sequelize = getTestSequelize();

  // Organizations is not RLS-protected (it's per-tenant config, keyed by
  // organizationId handle). Plain INSERT is enough.
  await sequelize.query(
    `INSERT INTO "Organizations" (id, "organizationId", "organizationName", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :handle, :name, NOW(), NOW())
     ON CONFLICT ("organizationId") DO NOTHING`,
    { replacements: { handle: orgAHandle, name: "Org A" } }
  );
  await sequelize.query(
    `INSERT INTO "Organizations" (id, "organizationId", "organizationName", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :handle, :name, NOW(), NOW())
     ON CONFLICT ("organizationId") DO NOTHING`,
    { replacements: { handle: orgBHandle, name: "Org B" } }
  );

  // Ideas IS RLS-protected, so seeding must run inside a transaction with
  // SET LOCAL app.tenant_id = <tid>. Otherwise the INSERT silently affects
  // zero rows (FORCE RLS rejects it).
  await sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
      replacements: { tid: tenantAId },
      transaction: t,
    });
    await sequelize.query(
      `INSERT INTO "Ideas" (id, title, description, "organizationId", status, "createdAt", "updatedAt", "tenant_id")
       VALUES (gen_random_uuid(), 'Idea A', 'Belongs to A', :handle, 'open', NOW(), NOW(), :tid)`,
      {
        replacements: { handle: orgAHandle, tid: tenantAId },
        transaction: t,
      }
    );
  });
  await sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
      replacements: { tid: tenantBId },
      transaction: t,
    });
    await sequelize.query(
      `INSERT INTO "Ideas" (id, title, description, "organizationId", status, "createdAt", "updatedAt", "tenant_id")
       VALUES (gen_random_uuid(), 'Idea B', 'Belongs to B', :handle, 'open', NOW(), NOW(), :tid)`,
      {
        replacements: { handle: orgBHandle, tid: tenantBId },
        transaction: t,
      }
    );
  });

  const { wrapTenantTransaction } = await import(
    "../../backend/src/middleware/wrapTenantTransaction.js"
  );

  app = express();
  app.use((req, res, next) => {
    const tid = req.headers["x-test-tenant"];
    if (tid) req.tenant = { id: tid };
    next();
  });
  app.use(wrapTenantTransaction);
  app.get("/ideas", async (req, res) => {
    const [rows] = await sequelize.query(
      `SELECT title FROM "Ideas" ORDER BY title`
    );
    res.json(rows);
  });
});

afterAll(async () => {
  // The fixture's sequelize is closed by globalTeardown via stopPgContainer.
  // Nothing to do here.
});

describe("wrapTenantTransaction -- analytics RLS isolation", () => {
  it("tenant A request reads only A's ideas (RLS via SET LOCAL inside tx)", async () => {
    const res = await request(app).get("/ideas").set("X-Test-Tenant", tenantAId);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.title)).toEqual(["Idea A"]);
  });

  it("pool reuse: A then B on the same connection sees only own rows", async () => {
    const resA = await request(app)
      .get("/ideas")
      .set("X-Test-Tenant", tenantAId);
    const resB = await request(app)
      .get("/ideas")
      .set("X-Test-Tenant", tenantBId);

    expect(resA.body.map((r) => r.title)).toEqual(["Idea A"]);
    expect(resB.body.map((r) => r.title)).toEqual(["Idea B"]);
  });

  it("after a wrapped request commits, a bare query on the same pool sees zero rows (transaction-local proof)", async () => {
    // Drive a wrapped tenant-A request first to ensure the pool's only
    // connection has just held SET LOCAL app.tenant_id = tenantA inside a
    // transaction. After commit, that LOCAL value is dropped.
    await request(app).get("/ideas").set("X-Test-Tenant", tenantAId);

    // Bare query OUTSIDE any transaction. Because SET LOCAL was
    // transaction-scoped, app.tenant_id is now empty here. The RLS policy
    // `current_setting('app.tenant_id', true)` returns NULL, so no rows
    // satisfy `tenant_id::text = NULL`. Expect zero rows.
    const [rows] = await sequelize.query(
      `SELECT title FROM "Ideas" ORDER BY title`
    );
    expect(rows).toEqual([]);
  });
});
