/**
 * Phase 3 Slice 2 (#851) regression guard — GET /api/auth/me must return the
 * per-user walkthrough flags and primaryOrganizationId.
 *
 * /auth/me is re-fetched on every returning session and overwrites the auth
 * context user. Before this slice it omitted hasSeen*Walkthrough, so the
 * frontend tour gate read `undefined` (falsy) on every reload and the tour
 * re-triggered forever. This proves the payload now carries the flags as
 * real booleans (coerced) plus primaryOrganizationId (null when absent).
 */
import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-851";
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_EXPIRATION = "7d";

const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const orgId = "test-org";

let userRow;

const mockUser = {
  findByPk: jest.fn(async (id) => (id === userId ? userRow : null)),
  findOne: jest.fn(async () => null),
};

jest.unstable_mockModule("../../backend/src/models/UserSession.js", () => ({
  default: { create: jest.fn(), findOne: jest.fn().mockResolvedValue(null), update: jest.fn() },
}));
jest.unstable_mockModule("../../backend/src/models/User.js", () => ({ default: mockUser }));
jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({
  default: { findOne: jest.fn() },
}));
jest.unstable_mockModule("../../backend/src/models/index.js", () => ({
  sequelize: {
    transaction: jest.fn(async (fn) => fn(Symbol("tx"))),
    query: jest.fn().mockResolvedValue([[], []]),
  },
}));
jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: { query: jest.fn().mockResolvedValue([[], []]) },
}));
jest.unstable_mockModule("../../backend/src/middleware/tenantResolver.js", () => ({
  getTenantId: jest.fn().mockResolvedValue(null),
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule("../../backend/src/services/notificationEmailService.js", () => ({
  sendPasswordResetEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendPasswordChangedEmail: jest.fn(),
  sendAdminUserPendingApprovalEmail: jest.fn(),
  sendMagicLinkEmail: jest.fn(),
}));
jest.unstable_mockModule("../../backend/src/lib/recaptcha.js", () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true }),
}));
jest.unstable_mockModule("../../backend/src/utils/logger.js", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule("../../backend/src/middleware/auditLog.js", () => ({
  auditLogger: () => (req, res, next) => next(),
}));
jest.unstable_mockModule("../../backend/src/middleware/security.js", () => ({
  validationRules: { username: [], password: [], email: [] },
  handleValidationErrors: (req, res, next) => next(),
}));

const { protectedRouter: authProtected } = await import("../../backend/src/routes/auth.js");
const { authenticate } = await import("../../backend/src/middleware/auth.js");
const { describe, it, expect, beforeEach } = await import("@jest/globals");
const request = (await import("supertest")).default;
const express = (await import("express")).default;

const app = express();
app.use(express.json());
app.use("/api/auth", authenticate, authProtected);

// Legacy token without jti: passes authenticate via the opportunistic model
// (#490), so this test does not need UserSession plumbing.
const token = () =>
  jwt.sign({ id: userId, organizationId: orgId }, JWT_SECRET, {
    expiresIn: "7d",
    algorithm: "HS256",
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.findByPk.mockImplementation(async (id) => (id === userId ? userRow : null));
});

describe("#851 Slice 2 — /auth/me walkthrough payload", () => {
  it("returns the per-user walkthrough flags and primaryOrganizationId", async () => {
    userRow = {
      id: userId,
      username: "tester",
      organizationId: orgId,
      isAdmin: true,
      isSuperuser: true,
      email: "t@example.com",
      hasSeenSuperuserWalkthrough: true,
      hasSeenAdminWalkthrough: false,
      hasSeenUserWalkthrough: false,
      primaryOrganizationId: "demo-corp",
    };

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.hasSeenSuperuserWalkthrough).toBe(true);
    expect(res.body.hasSeenAdminWalkthrough).toBe(false);
    expect(res.body.hasSeenUserWalkthrough).toBe(false);
    expect(res.body.primaryOrganizationId).toBe("demo-corp");
  });

  it("coerces absent flags to false and missing primaryOrganizationId to null", async () => {
    // An older row that predates these columns: fields are undefined. The
    // payload must NOT forward undefined (which the frontend reads as falsy
    // for the gate but is fragile); it coerces to explicit false / null.
    userRow = {
      id: userId,
      username: "legacy",
      organizationId: orgId,
      isAdmin: false,
      isSuperuser: false,
      email: "l@example.com",
    };

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.hasSeenSuperuserWalkthrough).toBe(false);
    expect(res.body.hasSeenAdminWalkthrough).toBe(false);
    expect(res.body.hasSeenUserWalkthrough).toBe(false);
    expect(res.body.primaryOrganizationId).toBe(null);
  });
});
