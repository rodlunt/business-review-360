/**
 * Issue #751 -- end-to-end proof that verifyTenantUserMatch returns 403
 * BEFORE wrapTenantTransaction's role-switch + RLS scope can short-circuit
 * the request to a misleading 401.
 *
 * Mirrors the prod attack vector documented in #751 / PR #750 smoke:
 *   - dcadmin user belongs to demo-corp
 *   - dcadmin's JWT is presented against ?organizationId=test-org-2
 *
 * Without verifyTenantUserMatch (the prod state at session-end of
 * 2026-05-03), the wrap sets app.tenant_id = test-org-2.id and
 * SET LOCAL ROLE br360_app_user. The downstream User.findByPk(dcadmin.id)
 * is RLS-scoped to test-org-2, returns null, and the request exits with
 * 401 "User not found".
 *
 * With verifyTenantUserMatch mounted before wrapTenantTransaction, the JWT
 * claim mismatch is detected before the wrap runs. The request returns
 * 403 TENANT_ACCESS_DENIED, restoring defence-in-depth layer 1.
 */

// APP_DB_ROLE must be set before wrapTenantTransaction is imported -- the
// const is captured at module load (see wrapTenantTransaction.js:32).
process.env.APP_DB_ROLE = "test";

// Integration jest config has no setupFiles, so JWT_SECRET is not loaded
// from backend/.env.test. Match the value the unit suite uses so JWTs
// signed here verify cleanly inside authenticate.
process.env.JWT_SECRET = process.env.JWT_SECRET ||
  "test-jwt-secret-do-not-use-in-prod-please";

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
// Resolve from backend/node_modules to match the existing integration-test
// pattern (see analyticsRls.test.js's cls-hooked import). The integration
// jest config has no moduleDirectories, so direct paths are required.
import jwt from "../../backend/node_modules/jsonwebtoken/index.js";
import { Sequelize } from "sequelize";
import cls from "../../backend/node_modules/cls-hooked/index.js";
import { getTestSequelize } from "../test-fixtures/postgres-rls-fixture.js";

const namespace = cls.createNamespace("br360-tenant-tx-751");
Sequelize.useCLS(namespace);

// Mock the application DB module so wrapTenantTransaction's
// `import { sequelize } from "../models/database.js"` resolves to the
// testcontainers instance.
jest.unstable_mockModule(
  "../../backend/src/models/database.js",
  async () => ({
    sequelize: getTestSequelize(),
    namespace,
  })
);

// Stub User model so the downstream User.findByPk inside the test handler
// reads through the same Sequelize CLS the wrapper has bound.
const sequelize = getTestSequelize();
jest.unstable_mockModule("../../backend/src/models/User.js", async () => ({
  default: {
    findByPk: async (id) => {
      const [rows] = await sequelize.query(
        `SELECT id, username, "organizationId" FROM "Users" WHERE id = :id`,
        { replacements: { id } }
      );
      return rows[0] ? { ...rows[0] } : null;
    },
  },
}));

const tenantDemoId = "55555555-5555-5555-5555-555555555555";
const tenantOtherId = "66666666-6666-6666-6666-666666666666";
const orgDemoHandle = "demo-corp-751";
const orgOtherHandle = "test-org-2-751";
const dcadminId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const JWT_SECRET = process.env.JWT_SECRET;

let app;

beforeAll(async () => {
  // Seed both Organizations.
  for (const handle of [orgDemoHandle, orgOtherHandle]) {
    await sequelize.query(
      `INSERT INTO "Organizations" (id, "organizationId", "organizationName", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), :handle, :name, NOW(), NOW())
       ON CONFLICT ("organizationId") DO NOTHING`,
      { replacements: { handle, name: handle } }
    );
  }

  // Seed dcadmin under demo-corp (RLS-scoped insert).
  await sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL app.tenant_id = :tid`, {
      replacements: { tid: tenantDemoId },
      transaction: t,
    });
    await sequelize.query(
      `INSERT INTO "Users" (id, username, "passwordHash", email, "isAdmin", "isAnonymous", "isApproved", "organizationId", "tenant_id", "createdAt", "updatedAt")
       VALUES (:uid, 'dcadmin-751', 'x', 'dcadmin-751@example.com', true, false, true, :org, :tid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      {
        replacements: {
          uid: dcadminId,
          org: orgDemoHandle,
          tid: tenantDemoId,
        },
        transaction: t,
      }
    );
  });

  // Imports must happen after mocks are registered.
  const { wrapTenantTransaction } = await import(
    "../../backend/src/middleware/wrapTenantTransaction.js"
  );
  const { verifyTenantUserMatch } = await import(
    "../../backend/src/middleware/verifyTenantUserMatch.js"
  );
  const { authenticate } = await import(
    "../../backend/src/middleware/auth.js"
  );

  app = express();

  // Stand-in for resolveTenant: in the real stack resolveTenant queries
  // the platform DB. Here the test injects req.tenant directly via header
  // to keep the harness focused on the wrap + verify ordering.
  app.use((req, res, next) => {
    const handle = req.query.organizationId;
    if (handle === orgDemoHandle) {
      req.tenant = { id: tenantDemoId, org_id: orgDemoHandle };
    } else if (handle === orgOtherHandle) {
      req.tenant = { id: tenantOtherId, org_id: orgOtherHandle };
    }
    next();
  });

  // Order under test: verifyTenantUserMatch BEFORE wrapTenantTransaction
  // so the 403 fires before the role-switch / RLS scope is established.
  app.use(verifyTenantUserMatch);
  app.use(wrapTenantTransaction);
  app.get("/whoami", authenticate, (req, res) => {
    res.json({ username: req.user.username });
  });
});

afterAll(async () => {
  // Container teardown handled by globalTeardown.
});

describe("verifyTenantUserMatch -- end-to-end RLS-prod parity (#751)", () => {
  it("returns 403 TENANT_ACCESS_DENIED for cross-tenant JWT (not 401)", async () => {
    const dcadminToken = jwt.sign(
      { id: dcadminId, organizationId: orgDemoHandle },
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/whoami")
      .query({ organizationId: orgOtherHandle })
      .set("Authorization", `Bearer ${dcadminToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "You do not have access to this organization's data.",
      code: "TENANT_ACCESS_DENIED",
    });
  });

  it("returns 200 for a same-tenant JWT (positive control)", async () => {
    const dcadminToken = jwt.sign(
      { id: dcadminId, organizationId: orgDemoHandle },
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/whoami")
      .query({ organizationId: orgDemoHandle })
      .set("Authorization", `Bearer ${dcadminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "dcadmin-751" });
  });

  it("returns 401 when no token is supplied (defers to authenticate)", async () => {
    const res = await request(app)
      .get("/whoami")
      .query({ organizationId: orgOtherHandle });

    expect(res.status).toBe(401);
  });
});
