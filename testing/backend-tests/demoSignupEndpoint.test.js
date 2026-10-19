/**
 * #892 PR 3 -- POST /api/auth/demo-signup endpoint unit test.
 *
 * Public-facing lead-capture replacement for the shared dcuser/dcadmin
 * demo credentials. Creates a real User row in the demo-corp tenant
 * (signupSource='demo-signup') with the prospect's companyName captured
 * for follow-up.
 *
 * Scaffold mirrors onboardingPhase5d.test.js (register-capable transaction
 * + tenant-DB mock pattern).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "sqlite::memory:";
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || "sqlite::memory:";

import { jest } from "@jest/globals";

const JWT_SECRET = "test-secret-demo-signup-pr3";
process.env.JWT_SECRET = JWT_SECRET;
delete process.env.DEMO_ORG_ID;
delete process.env.PLATFORM_OWNER_ID;

const mockUser = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  findByPk: jest.fn(),
};
const mockUOM = { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() };
const mockOrg = { findOne: jest.fn(), findAll: jest.fn() };
const mockSequelize = { transaction: jest.fn(), query: jest.fn() };
const mockPlatformSequelize = { query: jest.fn() };
const mockGenerateToken = jest.fn(() => ({ token: "demo-jwt", jti: "jti-demo" }));
const mockCreateSession = jest.fn().mockResolvedValue({});
const findUniqueUsernameMock = jest.fn().mockResolvedValue("sarah_chen");
const notifyEventMock = jest.fn().mockResolvedValue();

jest.unstable_mockModule("../../backend/src/models/User.js", () => ({ default: mockUser }));
jest.unstable_mockModule("../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: mockUOM,
}));
jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({ default: mockOrg }));
jest.unstable_mockModule("../../backend/src/models/index.js", () => ({ sequelize: mockSequelize }));
jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: mockPlatformSequelize,
}));
jest.unstable_mockModule("../../backend/src/middleware/tenantResolver.js", () => ({
  getTenantId: jest.fn().mockResolvedValue(null),
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
  resolveTenant: (_req, _res, next) => next(),
}));
jest.unstable_mockModule("../../backend/src/middleware/auth.js", () => ({
  authenticate: (_req, _res, next) => next(),
  generateToken: mockGenerateToken,
  createSession: mockCreateSession,
  ACCESS_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));
jest.unstable_mockModule("../../backend/src/lib/recaptcha.js", () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true }),
}));
jest.unstable_mockModule("../../backend/src/middleware/auditLog.js", () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  redactForAudit: (x) => x,
}));
jest.unstable_mockModule("../../backend/src/utils/ntfy.js", () => ({
  notifyError: jest.fn().mockResolvedValue(),
  notifyEvent: notifyEventMock,
}));
jest.unstable_mockModule("../../backend/src/services/notificationEmailService.js", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));
// The /demo-signup handler dynamically imports findUniqueUsername from
// oauth.js. Mock the module so the handler resolves a deterministic
// username without touching real DB lookups.
jest.unstable_mockModule("../../backend/src/routes/oauth.js", () => ({
  findUniqueUsername: findUniqueUsernameMock,
  publicRouter: { post: () => {}, get: () => {} },
  protectedRouter: { post: () => {}, get: () => {} },
}));

const { publicRouter: authPublic } = await import("../../backend/src/routes/auth.js");
const { describe, it, expect, beforeEach } = await import("@jest/globals");
const request = (await import("supertest")).default;
const express = (await import("express")).default;

const app = express();
app.use(express.json());
app.use("/api/auth", authPublic);

const fakeTx = Symbol("tx");
const VALID = {
  email: "sarah@acme.example",
  fullName: "Sarah Chen",
  companyName: "Acme Co",
  password: "longerthan8chars",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTx));
  mockSequelize.query.mockResolvedValue([[], []]);
  mockPlatformSequelize.query.mockResolvedValue([{ id: "tenant-democorp" }]);
  mockOrg.findOne.mockResolvedValue({
    organizationId: "demo-corp",
    organizationName: "Demo Corp",
  });
  mockUser.findOne.mockResolvedValue(null);
  mockUser.create.mockResolvedValue({
    id: "u-demo-1",
    username: "sarah_chen",
    email: "sarah@acme.example",
    organizationId: "demo-corp",
    signupSource: "demo-signup",
    companyName: "Acme Co",
    update: jest.fn().mockResolvedValue(undefined),
  });
  mockUOM.create.mockResolvedValue({});
  mockGenerateToken.mockReturnValue({ token: "demo-jwt", jti: "jti-demo" });
  mockCreateSession.mockResolvedValue({});
  findUniqueUsernameMock.mockResolvedValue("sarah_chen");
});

describe("POST /api/auth/demo-signup -- validation", () => {
  it("400 when email is missing", async () => {
    const { email: _email, ...rest } = VALID;
    const res = await request(app).post("/api/auth/demo-signup").send(rest);
    expect(res.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("400 when fullName is missing", async () => {
    const { fullName: _fullName, ...rest } = VALID;
    const res = await request(app).post("/api/auth/demo-signup").send(rest);
    expect(res.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("400 when companyName is missing", async () => {
    const { companyName: _companyName, ...rest } = VALID;
    const res = await request(app).post("/api/auth/demo-signup").send(rest);
    expect(res.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("400 when password is shorter than 8 chars", async () => {
    const res = await request(app)
      .post("/api/auth/demo-signup")
      .send({ ...VALID, password: "short" });
    expect(res.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/demo-signup -- happy path", () => {
  it("creates the User + membership in demo-corp and returns a token", async () => {
    const res = await request(app).post("/api/auth/demo-signup").send(VALID);

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("demo-jwt");
    expect(res.body.user).toMatchObject({
      id: "u-demo-1",
      organizationId: "demo-corp",
      isApproved: true,
    });

    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "sarah_chen",
        email: "sarah@acme.example",
        organizationId: "demo-corp",
        signupSource: "demo-signup",
        companyName: "Acme Co",
        isApproved: true,
        isAnonymous: false,
        lastActiveAt: expect.any(Date),
      }),
      expect.objectContaining({ transaction: fakeTx })
    );

    expect(mockUOM.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-demo-1",
        organizationId: "demo-corp",
        isAdmin: false,
        isApproved: true,
        isSuperuser: false,
      }),
      expect.objectContaining({ transaction: fakeTx })
    );

    expect(findUniqueUsernameMock).toHaveBeenCalledWith("Sarah Chen", "sarah@acme.example");
    expect(notifyEventMock).toHaveBeenCalledTimes(1);
  });

  it("normalises the email (trim + lowercase) before lookup and storage", async () => {
    await request(app)
      .post("/api/auth/demo-signup")
      .send({ ...VALID, email: "  Sarah@Acme.EXAMPLE  " });

    expect(mockUser.findOne).toHaveBeenCalledWith({
      where: { email: "sarah@acme.example" },
    });
    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "sarah@acme.example" }),
      expect.anything()
    );
  });
});

describe("POST /api/auth/demo-signup -- cross-tenant email guard", () => {
  it("409 Email already in use when the email exists in any tenant", async () => {
    mockUser.findOne.mockResolvedValueOnce({ id: "existing-row", email: "sarah@acme.example" });
    const res = await request(app).post("/api/auth/demo-signup").send(VALID);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Email already in use" });
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockUOM.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/demo-signup -- tenant lookup failure", () => {
  it("500 when demo-corp tenant is not configured", async () => {
    mockPlatformSequelize.query.mockResolvedValueOnce([]);
    const res = await request(app).post("/api/auth/demo-signup").send(VALID);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/demo organisation not available/i);
    expect(mockUser.create).not.toHaveBeenCalled();
  });
});
