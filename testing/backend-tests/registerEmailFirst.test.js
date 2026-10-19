/**
 * #892 (register slice) -- POST /api/auth/register is email-first on BOTH
 * the org-scoped and org-less paths. Username is no longer accepted as
 * user input; the backend auto-generates a display-name username via the
 * shared OAuth `findUniqueUsername` helper (same helper /demo-signup uses).
 *
 * Scaffold mirrors onboardingPhase5d.test.js / demoSignupEndpoint.test.js
 * (register-capable transaction-mock pattern + oauth.js username-generator
 * mock, since `User` here is a plain jest mock rather than a real
 * Sequelize.Model -- importing the real oauth.js would otherwise crash at
 * load time inside OAuthLink's `belongsTo(User, ...)` association wiring).
 */
import { jest } from "@jest/globals";

const JWT_SECRET = "test-secret-register-email-first-892";
process.env.JWT_SECRET = JWT_SECRET;
delete process.env.SELF_SERVE_ORG_ID;
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
const mockGenerateToken = jest.fn(() => ({ token: "access-token", jti: "jti-1" }));
const mockCreateSession = jest.fn().mockResolvedValue({});
const notifyEventMock = jest.fn().mockResolvedValue();
const findUniqueUsernameMock = jest.fn().mockResolvedValue("generated_user");

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
// /register now dynamically imports findUniqueUsername from oauth.js, same
// as /demo-signup. Mocked for the same reason demoSignupEndpoint.test.js
// mocks it: `User` above is a plain jest mock, not a Sequelize.Model
// subclass, so loading the real oauth.js (which pulls in OAuthLink and its
// `belongsTo(User, ...)` association) would throw at import time.
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

const ORG_VALID = {
  password: "Password123!",
  email: "new.orgscoped@example.com",
  organizationId: "acme-org",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTx));
  mockSequelize.query.mockResolvedValue([[], []]);
  mockPlatformSequelize.query.mockResolvedValue([{ id: "tenant-acme" }]);
  mockOrg.findOne.mockResolvedValue({
    organizationId: "acme-org",
    allowSelfRegistration: true,
    oauthAutoSuperuser: false,
  });
  // #892: no more username-uniqueness pre-check; only the global
  // email-uniqueness lookup runs before the transaction. findOne is used
  // throughout (never findByPk) per the CLAUDE.md SQLite-harness note.
  mockUser.findOne.mockResolvedValue(null);
  mockUser.create.mockResolvedValue({
    id: "u-org-1",
    username: "generated_user",
    email: "new.orgscoped@example.com",
    organizationId: "acme-org",
    isAnonymous: false,
    isApproved: true,
    isAdmin: false,
    isSuperuser: false,
    update: jest.fn().mockResolvedValue(undefined),
  });
  mockUOM.create.mockResolvedValue({});
  mockGenerateToken.mockReturnValue({ token: "access-token", jti: "jti-1" });
  mockCreateSession.mockResolvedValue({});
  findUniqueUsernameMock.mockResolvedValue("generated_user");
});

describe("#892 -- POST /api/auth/register org-scoped happy path", () => {
  it("auto-generates a unique username server-side and creates a non-anonymous user", async () => {
    const res = await request(app).post("/api/auth/register").send(ORG_VALID);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("generated_user");
    expect(res.body.user.isAnonymous).toBe(false);

    // Username is generated from fullName/email BEFORE the transaction,
    // exactly like /demo-signup -- no fullName sent here, so it falls back
    // to the email local part inside the real findUniqueUsername (mocked
    // here, but the call arguments still prove the wiring).
    expect(findUniqueUsernameMock).toHaveBeenCalledWith(undefined, "new.orgscoped@example.com");

    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "generated_user",
        email: "new.orgscoped@example.com",
        isAnonymous: false,
      }),
      expect.objectContaining({ transaction: fakeTx })
    );
  });

  it("passes fullName through to findUniqueUsername when supplied", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ ...ORG_VALID, fullName: "Jamie Rivers" });

    expect(findUniqueUsernameMock).toHaveBeenCalledWith(
      "Jamie Rivers",
      "new.orgscoped@example.com"
    );
  });
});

describe("#892 -- POST /api/auth/register email validation (both paths)", () => {
  it("400 when email is missing on the org-scoped path", async () => {
    const { email: _email, ...rest } = ORG_VALID;
    const res = await request(app).post("/api/auth/register").send(rest);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("400 when email is missing on the org-less path", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ password: "Password123!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("400 when email is malformed", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...ORG_VALID, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("409 when the email already exists (cross-tenant single-identity guard)", async () => {
    mockUser.findOne.mockResolvedValue({ id: "existing-user" });

    const res = await request(app).post("/api/auth/register").send(ORG_VALID);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Email already in use" });
    expect(mockUser.create).not.toHaveBeenCalled();
  });
});

describe("#892 -- POST /api/auth/register approval-required path", () => {
  it("returns 202 pending when the org disables self-registration", async () => {
    mockOrg.findOne.mockResolvedValue({
      organizationId: "acme-org",
      allowSelfRegistration: false,
      oauthAutoSuperuser: false,
    });
    mockUser.create.mockResolvedValue({
      id: "u-pending-1",
      username: "generated_user",
      email: "new.orgscoped@example.com",
      organizationId: "acme-org",
      isAnonymous: false,
      isApproved: false,
      update: jest.fn().mockResolvedValue(undefined),
    });
    // requiresApproval fetches org admins to notify -- findAll (not
    // findByPk) per the CLAUDE.md SQLite-harness convention.
    mockUser.findAll.mockResolvedValue([]);

    const res = await request(app).post("/api/auth/register").send(ORG_VALID);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: true, pending: true });
    expect(res.body.user).toMatchObject({ isApproved: false, username: "generated_user" });
  });
});
