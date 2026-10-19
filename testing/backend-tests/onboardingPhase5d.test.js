/**
 * Onboarding plan Phase 5 slice 5d (#869) -- org-optional /auth/register.
 *
 * POST /api/auth/register is now org-optional. When organizationId is
 * absent (the bare/main domain self-serve signup, the 5b routing change):
 *   - no email                -> 400 "Email is required to create an account."
 *   - email already in ANY tenant -> 409 "Email already in use" (the forward
 *       global-email guard; cross-tenant because /auth/register skips
 *       resolveTenant and runs BYPASSRLS in prod, OPERATIONAL_GOTCHAS #6)
 *   - otherwise -> the org is defaulted to the shared self-serve org
 *       (SELF_SERVE_ORG_ID || DEMO_ORG_ID || "demo-corp") and the EXISTING
 *       atomic User + UserOrganizationMembership transaction runs unchanged
 *       (200 { token, user }), and the existing demo-lead notify fires.
 * The org-scoped path (organizationId present, e.g. subdomain/invite) is
 * byte-for-byte unchanged and still validates the org via the platform DB.
 *
 * Scaffold mirrors onboardingPhase2a.test.js (the register-capable
 * transaction-mock pattern) + the ntfy mock from onboardingPhase5a.
 */
import { jest } from "@jest/globals";

const JWT_SECRET = "test-secret-onboarding-phase5d";
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
const notifyErrorMock = jest.fn().mockResolvedValue();

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
  notifyError: notifyErrorMock,
  notifyEvent: notifyEventMock,
}));
jest.unstable_mockModule("../../backend/src/services/notificationEmailService.js", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));
// #892: /auth/register now dynamically imports findUniqueUsername from
// oauth.js. Mocked because `User` above is a plain jest mock, not a
// Sequelize.Model subclass -- loading the real oauth.js (which pulls in
// OAuthLink's `belongsTo(User, ...)` association) would throw at import
// time otherwise.
const findUniqueUsernameMock = jest.fn().mockResolvedValue("newuser");
jest.unstable_mockModule("../../backend/src/routes/oauth.js", () => ({
  findUniqueUsername: findUniqueUsernameMock,
  publicRouter: { post: () => {}, get: () => {} },
  protectedRouter: { post: () => {}, get: () => {} },
}));

const { publicRouter: authPublic } = await import("../../backend/src/routes/auth.js");
const { describe, it, expect, beforeEach, afterEach } = await import("@jest/globals");
const request = (await import("supertest")).default;
const express = (await import("express")).default;

const app = express();
app.use(express.json());
app.use("/api/auth", authPublic);

const fakeTx = Symbol("tx");
const VALID = { password: "Password123!", email: "self@e2e.local" };

beforeEach(() => {
  jest.clearAllMocks();
  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTx));
  mockSequelize.query.mockResolvedValue([[], []]);
  mockPlatformSequelize.query.mockResolvedValue([{ id: "tenant-1" }]);
  mockOrg.findOne.mockResolvedValue({
    organizationId: "demo-corp",
    allowSelfRegistration: true,
    oauthAutoSuperuser: false,
  });
  mockUser.findOne.mockResolvedValue(null);
  mockUser.create.mockResolvedValue({
    id: "u1",
    username: "newuser",
    email: "self@e2e.local",
    organizationId: "demo-corp",
    isAnonymous: false,
    isApproved: true,
    // #892 PR1: register's auto-login path calls user.update(lastActiveAt).
    update: jest.fn().mockResolvedValue(undefined),
  });
  mockUOM.create.mockResolvedValue({});
  mockGenerateToken.mockReturnValue({ token: "access-token", jti: "jti-1" });
  mockCreateSession.mockResolvedValue({});
  findUniqueUsernameMock.mockResolvedValue("newuser");
});

describe("Phase 5d - org-less /auth/register validation", () => {
  // #892: email is now enforced by the validator chain (body("email")
  // .notEmpty()) rather than the org-less branch's own handler-level 400,
  // so a request with no email never reaches that branch at all -- the
  // response shape changed from the old custom message to the standard
  // express-validator "Validation failed" + details shape.
  it('400 "Validation failed" when no organizationId and no email', async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ password: "Password123!" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "email" })])
    );
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockPlatformSequelize.query).not.toHaveBeenCalled();
  });
});

describe("Phase 5d - org-less self-serve registration", () => {
  it("defaults the org to demo-corp and creates the user + membership atomically", async () => {
    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("access-token");
    expect(res.body.user).toMatchObject({ id: "u1", organizationId: "demo-corp" });
    // Tenant resolved for the defaulted self-serve org, not for an empty id.
    expect(mockPlatformSequelize.query).toHaveBeenCalledWith(
      "SELECT id FROM tenants WHERE org_id = :organizationId",
      expect.objectContaining({ replacements: { organizationId: "demo-corp" } })
    );
    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "demo-corp",
        tenant_id: "tenant-1",
        // #892 PR1: org-less self-serve gets tagged for lead-outreach.
        signupSource: "demo-signup",
      }),
      expect.objectContaining({ transaction: fakeTx })
    );
    expect(mockUOM.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", organizationId: "demo-corp", isApproved: true }),
      expect.objectContaining({ transaction: fakeTx })
    );
    // The existing demo-lead notify fires (org === default DEMO_ORG_ID).
    expect(notifyEventMock).toHaveBeenCalledTimes(1);
  });

  it("honours SELF_SERVE_ORG_ID over the demo-corp default", async () => {
    process.env.SELF_SERVE_ORG_ID = "trial-org";
    mockOrg.findOne.mockResolvedValue({
      organizationId: "trial-org",
      allowSelfRegistration: true,
      oauthAutoSuperuser: false,
    });
    mockUser.create.mockResolvedValue({
      id: "u2",
      username: "newuser",
      email: "self@e2e.local",
      organizationId: "trial-org",
      isApproved: true,
      update: jest.fn().mockResolvedValue(undefined),
    });
    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(200);
    expect(mockPlatformSequelize.query).toHaveBeenCalledWith(
      "SELECT id FROM tenants WHERE org_id = :organizationId",
      expect.objectContaining({ replacements: { organizationId: "trial-org" } })
    );
    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "trial-org" }),
      expect.objectContaining({ transaction: fakeTx })
    );
  });

  it("NEVER auto-superusers an org-less self-serve user, even if the org has oauthAutoSuperuser=true (#869 follow-up regression)", async () => {
    // The shared self-serve org is a public sandbox; a random public
    // signup must be a plain member, not a superuser of it.
    mockOrg.findOne.mockResolvedValue({
      organizationId: "demo-corp",
      allowSelfRegistration: true,
      oauthAutoSuperuser: true,
    });
    mockUser.create.mockResolvedValue({
      id: "u9",
      username: "newuser",
      email: "self@e2e.local",
      organizationId: "demo-corp",
      isApproved: true,
      update: jest.fn().mockResolvedValue(undefined),
    });
    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(200);
    // `...(autoSuperuser && { isSuperuser: true })` => key absent when false.
    const userArg = mockUser.create.mock.calls[0][0];
    expect(userArg.isSuperuser).toBeUndefined();
    expect(mockUOM.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "demo-corp", isSuperuser: false }),
      expect.objectContaining({ transaction: fakeTx })
    );
  });

  afterEach(() => {
    delete process.env.SELF_SERVE_ORG_ID;
  });
});

describe("Phase 5d - forward global-email guard", () => {
  it('409 "Email already in use" when the email exists in any tenant (no user created)', async () => {
    // The username check (findOne by username) misses; the email check
    // (findOne by email) hits -> the existing cross-tenant 409. Identical
    // string to the org-scoped path: no new enumeration oracle.
    mockUser.findOne.mockImplementation(async ({ where }) =>
      where && where.email ? { id: "existing", email: where.email } : null
    );
    const res = await request(app).post("/api/auth/register").send(VALID);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Email already in use" });
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockUOM.create).not.toHaveBeenCalled();
  });
});

describe("Phase 5d - org-scoped path is unchanged", () => {
  it("does NOT default the org when organizationId is supplied (unknown org -> existing 400)", async () => {
    mockPlatformSequelize.query.mockResolvedValue([]); // tenant lookup miss
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID, organizationId: "acme-unknown" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid organization ID. Please check your registration link.",
    });
    // The supplied org was looked up verbatim; the self-serve default never ran.
    expect(mockPlatformSequelize.query).toHaveBeenCalledWith(
      "SELECT id FROM tenants WHERE org_id = :organizationId",
      expect.objectContaining({ replacements: { organizationId: "acme-unknown" } })
    );
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("creates the user in the SUPPLIED org, not the self-serve default", async () => {
    mockOrg.findOne.mockResolvedValue({
      organizationId: "acme",
      allowSelfRegistration: true,
      oauthAutoSuperuser: false,
    });
    mockUser.create.mockResolvedValue({
      id: "u3",
      username: "newuser",
      email: "self@e2e.local",
      organizationId: "acme",
      isApproved: true,
      update: jest.fn().mockResolvedValue(undefined),
    });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID, organizationId: "acme" });

    expect(res.status).toBe(200);
    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "acme",
        // #892 PR1: org-scoped registration is invite-driven.
        signupSource: "invite",
      }),
      expect.objectContaining({ transaction: fakeTx })
    );
    expect(notifyEventMock).not.toHaveBeenCalled(); // acme !== demo default
  });

  it("STILL honours org.oauthAutoSuperuser on the org-scoped path (unchanged by the #869 follow-up)", async () => {
    // Contrast with the org-less regression test: when organizationId is
    // SUPPLIED (subdomain/invite), auto-superuser behaviour is unchanged.
    mockOrg.findOne.mockResolvedValue({
      organizationId: "acme",
      allowSelfRegistration: true,
      oauthAutoSuperuser: true,
    });
    mockUser.create.mockResolvedValue({
      id: "u10",
      username: "newuser",
      email: "self@e2e.local",
      organizationId: "acme",
      isApproved: true,
      isSuperuser: true,
      update: jest.fn().mockResolvedValue(undefined),
    });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID, organizationId: "acme" });

    expect(res.status).toBe(200);
    const userArg = mockUser.create.mock.calls[0][0];
    expect(userArg.isSuperuser).toBe(true);
    expect(mockUOM.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "acme", isSuperuser: true }),
      expect.objectContaining({ transaction: fakeTx })
    );
  });
});
