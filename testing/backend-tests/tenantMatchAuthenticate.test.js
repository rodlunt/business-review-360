/**
 * Issue #751 -- regression test for the user/tenant match check inside
 * authenticate.
 *
 * The match was originally written into resolveTenant but was unreachable
 * because authenticate is mounted per-route (#489) and runs AFTER the
 * global resolveTenant. RLS at the DB layer caught cross-tenant attacks
 * (returning a misleading 401 "User not found") but defence-in-depth
 * layer 1 was inert.
 *
 * After #751 the match runs inside authenticate, where req.tenant
 * (set by resolveTenant) and req.user (just loaded) first coexist. The
 * expected outcomes:
 *
 *   1. matching org -> next() called, status untouched
 *   2. mismatched org -> 403 TENANT_ACCESS_DENIED, next() not called
 *   3. no req.tenant (eg public route, route bypassed resolveTenant)
 *      -> next() called regardless of user.organizationId, since the
 *      resolveTenant skip-list intentionally lets these through
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  jest,
} from "@jest/globals";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

const demoUser = {
  id: 100,
  username: "dcadmin",
  organizationId: "demo-corp",
};

jest.unstable_mockModule("../../backend/src/models/User.js", () => ({
  default: {
    findByPk: jest.fn(async (id) => (id === demoUser.id ? demoUser : null)),
  },
}));

const { authenticate } = await import("../../backend/src/middleware/auth.js");

function buildReqResNext({ token, tenant } = {}) {
  const req = {
    url: "/test",
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
    },
    tenant,
  };

  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
  };

  const next = jest.fn();

  return { req, res, next };
}

function makeToken() {
  return jwt.sign({ id: demoUser.id }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("authenticate -- #751 user/tenant match check", () => {
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes when req.tenant.org_id matches req.user.organizationId", async () => {
    const { req, res, next } = buildReqResNext({
      token: makeToken(),
      tenant: { id: "tenant-uuid", org_id: "demo-corp", tenant_name: "Demo Corp" },
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(req.user).toBe(demoUser);
  });

  it("returns 403 TENANT_ACCESS_DENIED when org IDs mismatch", async () => {
    const { req, res, next } = buildReqResNext({
      token: makeToken(),
      tenant: { id: "tenant-uuid", org_id: "test-org-2", tenant_name: "Test Org 2" },
    });

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "You do not have access to this organization's data.",
      code: "TENANT_ACCESS_DENIED",
    });
  });

  it("does not enforce a match when req.tenant is absent", async () => {
    const { req, res, next } = buildReqResNext({
      token: makeToken(),
      tenant: undefined,
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(req.user).toBe(demoUser);
  });
});
