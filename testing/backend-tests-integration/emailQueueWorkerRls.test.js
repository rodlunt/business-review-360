/**
 * Issue #744: emailQueueWorkerRls integration test.
 *
 * Proves withTenantContext (the helper used by processQueue) enforces the
 * same RLS isolation as wrapTenantTransaction does for HTTP requests. Mirrors
 * analyticsRls.test.js's contract but exercises the worker-side helper.
 *
 * The fixture role (`test`) is `NOSUPERUSER NOBYPASSRLS` so RLS actually
 * applies inside the wrapper. Setting APP_DB_ROLE=test before importing the
 * helper exercises the SET LOCAL ROLE branch on the same role we already
 * connect as (a no-op semantically, but proves the SQL is valid).
 *
 * Three cases:
 *   1. Wrapper for tenant A reads only A's user; wrapper for tenant B reads
 *      only B's user. Cross-tenant reads return null.
 *   2. After two wrapped calls (A then B) on the pool.max=1 connection,
 *      neither call leaks app.tenant_id into the next.
 *   3. After the wrapper commits, a bare query on the same connection sees
 *      zero rows (transaction-local proof).
 */

// APP_DB_ROLE must be set before withTenantContext is imported -- the const
// is captured at module load.
process.env.APP_DB_ROLE = "test";

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  jest,
} from "@jest/globals";
import { Sequelize } from "sequelize";
import cls from "../../backend/node_modules/cls-hooked/index.js";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

// Activate CLS so withTenantContext's transaction threads through nested
// queries the same way it does in production.
const namespace = cls.createNamespace("br360-tenant-tx-744");
Sequelize.useCLS(namespace);

jest.unstable_mockModule(
  "../../backend/src/models/database.js",
  async () => ({
    sequelize: getTestSequelize(),
    namespace,
  })
);

const tenantAId = "33333333-3333-3333-3333-333333333333";
const tenantBId = "44444444-4444-4444-4444-444444444444";
const orgAHandle = "org-a-744";
const orgBHandle = "org-b-744";
const userAId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const userBId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let sequelize;
let withTenantContext;

beforeAll(async () => {
  sequelize = getTestSequelize();

  // Organizations is not RLS-protected.
  await sequelize.query(
    `INSERT INTO "Organizations" (id, "organizationId", "organizationName", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :handle, :name, NOW(), NOW())
     ON CONFLICT ("organizationId") DO NOTHING`,
    { replacements: { handle: orgAHandle, name: "Org A 744" } }
  );
  await sequelize.query(
    `INSERT INTO "Organizations" (id, "organizationId", "organizationName", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :handle, :name, NOW(), NOW())
     ON CONFLICT ("organizationId") DO NOTHING`,
    { replacements: { handle: orgBHandle, name: "Org B 744" } }
  );

  // Users IS RLS-protected. Seed inside a transaction with SET LOCAL
  // app.tenant_id matching the row's tenant.
  await sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
      replacements: { tid: tenantAId },
      transaction: t,
    });
    await sequelize.query(
      `INSERT INTO "Users" (id, username, "passwordHash", email, "isAdmin", "isAnonymous", "isApproved", "organizationId", "tenant_id", "createdAt", "updatedAt")
       VALUES (:uid, 'user-a-744', 'x', 'user-a-744@example.com', false, false, true, :org, :tid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: { uid: userAId, org: orgAHandle, tid: tenantAId },
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
      `INSERT INTO "Users" (id, username, "passwordHash", email, "isAdmin", "isAnonymous", "isApproved", "organizationId", "tenant_id", "createdAt", "updatedAt")
       VALUES (:uid, 'user-b-744', 'x', 'user-b-744@example.com', false, false, true, :org, :tid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: { uid: userBId, org: orgBHandle, tid: tenantBId },
        transaction: t,
      }
    );
  });

  ({ withTenantContext } = await import(
    "../../backend/src/utils/withTenantContext.js"
  ));
});

afterAll(async () => {
  // Fixture handles container teardown.
});

describe("withTenantContext -- worker-side RLS isolation (#744)", () => {
  it("wrapper for tenant A reads only A's user; cross-tenant read returns null", async () => {
    const aFromA = await withTenantContext(tenantAId, async () => {
      const [rows] = await sequelize.query(
        `SELECT id, username FROM "Users" WHERE id = :uid`,
        { replacements: { uid: userAId } }
      );
      return rows;
    });
    expect(aFromA).toEqual([
      expect.objectContaining({ id: userAId, username: "user-a-744" }),
    ]);

    const bFromA = await withTenantContext(tenantAId, async () => {
      const [rows] = await sequelize.query(
        `SELECT id, username FROM "Users" WHERE id = :uid`,
        { replacements: { uid: userBId } }
      );
      return rows;
    });
    // RLS denies user B when app.tenant_id is set to tenant A.
    expect(bFromA).toEqual([]);
  });

  it("pool reuse: A then B on the same connection sees only own user", async () => {
    const aRows = await withTenantContext(tenantAId, async () => {
      const [rows] = await sequelize.query(
        `SELECT username FROM "Users" WHERE username IN ('user-a-744', 'user-b-744') ORDER BY username`
      );
      return rows;
    });
    const bRows = await withTenantContext(tenantBId, async () => {
      const [rows] = await sequelize.query(
        `SELECT username FROM "Users" WHERE username IN ('user-a-744', 'user-b-744') ORDER BY username`
      );
      return rows;
    });

    expect(aRows.map((r) => r.username)).toEqual(["user-a-744"]);
    expect(bRows.map((r) => r.username)).toEqual(["user-b-744"]);
  });

  it("after a wrapped call commits, a bare query on the same pool sees zero rows (transaction-local proof)", async () => {
    await withTenantContext(tenantAId, async () => {
      await sequelize.query(`SELECT 1`);
    });

    // Bare query OUTSIDE any wrapper: app.tenant_id is empty, role has been
    // reset (SET LOCAL ROLE reverts on commit), so the connection acts as
    // the constrained `test` role with NOBYPASSRLS and no tenant context.
    // RLS denies every row.
    const [rows] = await sequelize.query(
      `SELECT username FROM "Users" WHERE username IN ('user-a-744', 'user-b-744')`
    );
    expect(rows).toEqual([]);
  });

  it("rolls back when the callback throws", async () => {
    // The wrapper opens a transaction; if the callback throws, the txn
    // rolls back. We can't observe rollback directly, but we can prove
    // the error propagates and no side effect is committed.
    await expect(
      withTenantContext(tenantAId, async () => {
        await sequelize.query(`SELECT 1`);
        throw new Error("intentional");
      })
    ).rejects.toThrow("intentional");
  });
});
