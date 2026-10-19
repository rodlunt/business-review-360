/**
 * Issue #751 -- unit tests for the verifyTenantUserMatch middleware.
 *
 * Mounted globally on /api between resolveTenant and wrapTenantTransaction.
 * Runs the application-layer cross-tenant guard from a JWT claim (no DB
 * call), so the 403 fires BEFORE the role-switch / RLS scope is applied.
 *
 * Covered cases:
 *   1. match -> next()
 *   2. mismatch -> 403 TENANT_ACCESS_DENIED
 *   3. no req.tenant -> next() (public route)
 *   4. no token -> next() (let downstream authenticate handle 401)
 *   5. invalid token signature -> next() (let downstream authenticate
 *      issue the proper 401 with the correct error code)
 *   6. token without organizationId claim -> next() (legacy token; the
 *      DB-backed authenticate is the load-bearing check there)
 *
 * The end-to-end proof that this returns 403 in the prod-equivalent
 * RLS-enforcing path lives in
 * testing/backend-tests-integration/crossTenantMatch.test.js.
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

const { verifyTenantUserMatch } = await import(
  "../../backend/src/middleware/verifyTenantUserMatch.js"
);

function buildReqResNext({ token, tenant } = {}) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    tenant,
  };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

function tokenFor(organizationId) {
  return jwt.sign({ id: 42, organizationId }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("verifyTenantUserMatch -- #751", () => {
  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls next() when JWT organizationId matches req.tenant.org_id", () => {
    const { req, res, next } = buildReqResNext({
      token: tokenFor("demo-corp"),
      tenant: { id: "tenant-uuid", org_id: "demo-corp" },
    });
    verifyTenantUserMatch(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 TENANT_ACCESS_DENIED when JWT and tenant org IDs mismatch", () => {
    const { req, res, next } = buildReqResNext({
      token: tokenFor("demo-corp"),
      tenant: { id: "tenant-uuid", org_id: "test-org-2" },
    });
    verifyTenantUserMatch(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "You do not have access to this organization's data.",
      code: "TENANT_ACCESS_DENIED",
    });
  });

  it("calls next() when req.tenant is undefined (public route)", () => {
    const { req, res, next } = buildReqResNext({
      token: tokenFor("demo-corp"),
      tenant: undefined,
    });
    verifyTenantUserMatch(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("calls next() when no Authorization header is present", () => {
    const { req, res, next } = buildReqResNext({
      tenant: { id: "tenant-uuid", org_id: "demo-corp" },
    });
    verifyTenantUserMatch(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("calls next() when the JWT signature is invalid (defers to authenticate)", () => {
    const badToken = jwt.sign(
      { id: 42, organizationId: "demo-corp" },
      "wrong-secret",
      { algorithm: "HS256", expiresIn: "1h" }
    );
    const { req, res, next } = buildReqResNext({
      token: badToken,
      tenant: { id: "tenant-uuid", org_id: "test-org-2" },
    });
    verifyTenantUserMatch(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("calls next() when the JWT lacks an organizationId claim (legacy token)", () => {
    const legacyToken = jwt.sign({ id: 42 }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    const { req, res, next } = buildReqResNext({
      token: legacyToken,
      tenant: { id: "tenant-uuid", org_id: "demo-corp" },
    });
    verifyTenantUserMatch(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });
});
