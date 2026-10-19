/**
 * JWT Algorithm Pinning Tests
 *
 * Regression tests for issue #507: ensure `jwt.verify` in the auth middleware
 * rejects tokens signed with algorithms other than HS256. This defends against
 * future jsonwebtoken library changes that might re-allow `alg: none` or
 * accept mismatched symmetric algorithms.
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

// Issue #593: backend/jest.setup.js loads backend/.env.test before any test
// module resolves, so JWT_SECRET and DATABASE_URL come from there. Use the
// same value the setup file establishes so the JWT signing key matches what
// the auth middleware verifies against.
const JWT_SECRET = process.env.JWT_SECRET;

// Mock User.findByPk so the middleware resolves a user without a real DB.
const mockUser = {
  id: 42,
  username: "pinning-test",
  organizationId: "org-1",
};

jest.unstable_mockModule("../../backend/src/models/User.js", () => ({
  default: {
    findByPk: jest.fn(async (id) => (id === mockUser.id ? mockUser : null)),
  },
}));

// Import the middleware after the mock is registered so it picks up the stub.
const { authenticate } = await import("../../backend/src/middleware/auth.js");

function buildReqResNext(token) {
  const req = {
    url: "/test",
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
    },
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

describe("authenticate middleware: algorithm pinning (issue #507)", () => {
  beforeAll(() => {
    // Silence the middleware's console.log noise during the suite.
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a valid HS256 token", async () => {
    const token = jwt.sign({ id: mockUser.id }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    const { req, res, next } = buildReqResNext(token);
    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(req.user).toBe(mockUser);
  });

  it("rejects an `alg: none` token (unsigned)", async () => {
    // jsonwebtoken requires an empty secret when algorithm is `none`.
    const token = jwt.sign({ id: mockUser.id }, "", {
      algorithm: "none",
      expiresIn: "1h",
    });

    const { req, res, next } = buildReqResNext(token);
    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid token" });
  });

  it("rejects a token signed with a different symmetric algorithm (HS384)", async () => {
    const token = jwt.sign({ id: mockUser.id }, JWT_SECRET, {
      algorithm: "HS384",
      expiresIn: "1h",
    });

    const { req, res, next } = buildReqResNext(token);
    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid token" });
  });

  it("rejects a token signed with HS512", async () => {
    const token = jwt.sign({ id: mockUser.id }, JWT_SECRET, {
      algorithm: "HS512",
      expiresIn: "1h",
    });

    const { req, res, next } = buildReqResNext(token);
    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid token" });
  });
});
