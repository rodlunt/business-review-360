/**
 * Regression tests for tenantResolver middleware.
 *
 * #561: resolveTenant must NOT issue any session-level RLS context call
 *   (no `SELECT set_tenant_context(...)`, no `set_config(..., false)`,
 *   no `SET app.tenant_id` outside a transaction). Tenant context for RLS
 *   is set transaction-locally by wrapTenantTransaction. The original
 *   session-level mechanism leaked across pool reuse and was the root
 *   cause of #480. This test guards against any future change that
 *   reintroduces it on the resolver path.
 *
 * #751: resolveTenant must NOT attempt to verify req.user belongs to the
 *   resolved tenant. authenticate is mounted per-route and runs after
 *   resolveTenant, so req.user is always undefined here. The match check
 *   lives in authenticate (auth.js); see tenantMatchAuthenticate.test.js.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  jest,
} from "@jest/globals";

const platformQueryMock = jest.fn();
const appQueryMock = jest.fn();

jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: {
    query: platformQueryMock,
  },
}));

jest.unstable_mockModule("../../backend/src/models/database.js", () => ({
  sequelize: {
    query: appQueryMock,
    transaction: jest.fn(),
  },
}));

let resolveTenant;
beforeAll(async () => {
  ({ resolveTenant } = await import(
    "../../backend/src/middleware/tenantResolver.js"
  ));
});

beforeEach(() => {
  platformQueryMock.mockReset();
  appQueryMock.mockReset();
});

const makeReqRes = (overrides = {}) => {
  const req = {
    method: "GET",
    path: "/ideas",
    query: { organizationId: "demo-corp" },
    headers: {},
    get: () => undefined,
    ...overrides,
  };
  const res = {
    statusCode: 200,
    status: jest.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(),
  };
  return { req, res };
};

describe("resolveTenant -- regressions", () => {
  it("does not issue any application-DB query when resolving a valid tenant", async () => {
    platformQueryMock.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000001",
        org_id: "demo-corp",
        tenant_name: "Demo Corp",
        plan: "starter",
        status: "active",
        limits: {},
      },
    ]);
    const { req, res } = makeReqRes();
    const next = jest.fn();

    await resolveTenant(req, res, next);

    expect(req.tenant).toEqual(
      expect.objectContaining({ id: "00000000-0000-0000-0000-000000000001" })
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();

    // Acceptance: no application-DB query is fired by resolveTenant.
    // wrapTenantTransaction owns the SET LOCAL inside its own transaction.
    expect(appQueryMock).not.toHaveBeenCalled();
  });

  it("does not call set_tenant_context, set_config, or SET app.tenant_id from the resolver path", async () => {
    platformQueryMock.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000002",
        org_id: "test-org-2",
        tenant_name: "Test Org 2",
        plan: "starter",
        status: "active",
        limits: {},
      },
    ]);
    const { req, res } = makeReqRes({
      query: { organizationId: "test-org-2" },
    });
    const next = jest.fn();

    await resolveTenant(req, res, next);

    const allQueries = appQueryMock.mock.calls
      .map((args) => (typeof args[0] === "string" ? args[0] : ""))
      .join(" | ");
    expect(allQueries).not.toMatch(/set_tenant_context/i);
    expect(allQueries).not.toMatch(/set_config/i);
    expect(allQueries).not.toMatch(/SET\s+(LOCAL\s+)?app\.tenant_id/i);
  });

  it("does not attempt a user/tenant match check (#751: that check moved to authenticate)", async () => {
    platformQueryMock.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000001",
        org_id: "demo-corp",
        tenant_name: "Demo Corp",
        plan: "starter",
        status: "active",
      },
    ]);
    const { req, res } = makeReqRes();
    req.user = { id: "user-1", username: "intruder", organizationId: "other-org" };
    const next = jest.fn();

    await resolveTenant(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenant).toEqual(
      expect.objectContaining({ id: "00000000-0000-0000-0000-000000000001" })
    );
  });
});
