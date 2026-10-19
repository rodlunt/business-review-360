/**
 * Onboarding plan Phase 5 slice 5a (#858) -- org-optional /auth/login.
 *
 * POST /api/auth/login is now org-optional. When organizationId is absent
 * the credential is the email, resolved to the single canonical User row,
 * then handed to the existing picker machinery:
 *   - 0 User rows           -> 401 Invalid credentials (dummy bcrypt: timing)
 *   - >1 User rows          -> 401 + notifyError (split-identity fail-safe)
 *   - wrong password        -> 401 Invalid credentials
 *   - 0 approved memberships -> 401 Invalid credentials (no enumeration)
 *   - 1 approved membership  -> 200 { token, user }
 *   - >1 approved membership -> 200 { pickToken, multiOrg, memberships }
 * The org-scoped path (organizationId present) requires the same `email`
 * credential as the org-less path since #892 dropped username as a login
 * credential; org-scoped-specific outcome coverage (email lookup, dummy
 * verify parity, OAuth-only accounts) lives in orgScopedEmailLogin.test.js.
 *
 * Scaffold mirrors loginEnumerationRegression.test.js + onboardingPhase2b
 * (real validation + handler, models and side-effect modules mocked).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "sqlite::memory:";
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || "sqlite::memory:";

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";
import bcrypt from "bcrypt";

jest.unstable_mockModule("../../backend/src/services/notificationEmailService.js", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));

const mockUser = { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() };
jest.unstable_mockModule("../../backend/src/models/User.js", () => ({ default: mockUser }));

const mockUOM = { findAll: jest.fn(), findOne: jest.fn() };
jest.unstable_mockModule("../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: mockUOM,
}));

const mockOrg = { findAll: jest.fn() };
jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({
  default: mockOrg,
}));

jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: { query: jest.fn() },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../../backend/src/lib/recaptcha.js", () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule("../../backend/src/middleware/auditLog.js", () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn(),
  AuditLog: { create: jest.fn() },
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
  default: {},
}));

const getTenantIdMock = jest.fn().mockResolvedValue(null);
jest.unstable_mockModule("../../backend/src/middleware/tenantResolver.js", () => ({
  getTenantId: getTenantIdMock,
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
  resolveTenant: (_req, _res, next) => next(),
}));

const notifyErrorMock = jest.fn().mockResolvedValue();
const notifyEventMock = jest.fn().mockResolvedValue();
jest.unstable_mockModule("../../backend/src/utils/ntfy.js", () => ({
  notifyError: notifyErrorMock,
  notifyEvent: notifyEventMock,
}));

const generateTokenMock = jest.fn(() => ({ token: "issued.jwt.token", jti: "jti-1" }));
const createSessionMock = jest.fn().mockResolvedValue({});
jest.unstable_mockModule("../../backend/src/middleware/auth.js", () => ({
  generateToken: generateTokenMock,
  createSession: createSessionMock,
  ACCESS_TOKEN_TTL_MS: 900000,
  authenticate: (_req, _res, next) => next(),
}));

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-phase5a";
process.env.JWT_SECRET = JWT_SECRET;
delete process.env.PLATFORM_OWNER_ID;

const { publicRouter } = await import("../../backend/src/routes/auth.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", publicRouter);
  return app;
}

const PASSWORD = "Correct-Horse-9";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 12);

function makeUser(overrides = {}) {
  return {
    id: "user-1",
    username: "alice",
    email: "alice@example.com",
    passwordHash: PASSWORD_HASH,
    isAnonymous: false,
    primaryOrganizationId: null,
    hasSeenSuperuserWalkthrough: false,
    hasSeenAdminWalkthrough: false,
    hasSeenUserWalkthrough: false,
    // #892 PR1: every successful login path writes lastActiveAt via
    // user.update; mock returns the same plain object so the spy is
    // observable per-instance.
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  getTenantIdMock.mockResolvedValue(null);
  generateTokenMock.mockReturnValue({ token: "issued.jwt.token", jti: "jti-1" });
  createSessionMock.mockResolvedValue({});
  mockOrg.findAll.mockResolvedValue([]);
  app = buildApp();
});

describe("Phase 5a - org-less /auth/login validation", () => {
  it("400 when no organizationId and no email (email required on org-less path)", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: PASSWORD });
    expect(res.status).toBe(400);
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });

  it("400 when no organizationId and email is malformed", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe("Phase 5a - org-less authentication outcomes", () => {
  it("401 for an unknown email (and still runs a bcrypt compare for timing)", async () => {
    mockUser.findAll.mockResolvedValue([]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(mockUOM.findAll).not.toHaveBeenCalled();
  });

  it("normalises the email (trim + lowercase) to match registration storage", async () => {
    mockUser.findAll.mockResolvedValue([makeUser()]);
    mockUOM.findAll.mockResolvedValue([
      { organizationId: "demo-corp", isAdmin: true, isSuperuser: true },
    ]);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "  Alice@Example.COM  ", password: PASSWORD });
    expect(mockUser.findAll).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });
  });

  it("401 for a known email with the wrong password", async () => {
    mockUser.findAll.mockResolvedValue([makeUser()]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(generateTokenMock).not.toHaveBeenCalled();
  });

  it("401 when the password is correct but there is no approved membership", async () => {
    mockUser.findAll.mockResolvedValue([makeUser()]);
    mockUOM.findAll.mockResolvedValue([]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(generateTokenMock).not.toHaveBeenCalled();
  });

  it("401 for an OAuth-only account (null passwordHash) carrying an email", async () => {
    mockUser.findAll.mockResolvedValue([makeUser({ passwordHash: null })]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
  });

  it("200 with a token + org-scoped user payload for a single approved org", async () => {
    const user = makeUser();
    mockUser.findAll.mockResolvedValue([user]);
    mockUOM.findAll.mockResolvedValue([
      { organizationId: "demo-corp", isAdmin: true, isSuperuser: true },
    ]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBe("issued.jwt.token");
    expect(res.body.user).toMatchObject({
      id: "user-1",
      username: "alice",
      isAdmin: true,
      isSuperuser: true,
      organizationId: "demo-corp",
    });
    expect(res.body.pickToken).toBeUndefined();
    expect(generateTokenMock).toHaveBeenCalledWith("user-1", "demo-corp");
    expect(createSessionMock).toHaveBeenCalledWith(
      "jti-1",
      "user-1",
      "demo-corp",
      "access",
      900000
    );
    // #892 PR1: lead-capture stamp on every successful login.
    expect(user.update).toHaveBeenCalledWith({ lastActiveAt: expect.any(Date) });
  });

  it("200 with a pickToken + membership list (no session token) for multiple approved orgs", async () => {
    mockUser.findAll.mockResolvedValue([makeUser({ primaryOrganizationId: "org-b" })]);
    mockUOM.findAll.mockResolvedValue([
      { organizationId: "org-a", isAdmin: false, isSuperuser: false },
      { organizationId: "org-b", isAdmin: true, isSuperuser: false },
    ]);
    mockOrg.findAll.mockResolvedValue([
      { organizationId: "org-a", organizationName: "Org A" },
      { organizationId: "org-b", organizationName: "Org B" },
    ]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.multiOrg).toBe(true);
    expect(res.body.primaryOrganizationId).toBe("org-b");
    expect(typeof res.body.pickToken).toBe("string");
    expect(res.body.memberships).toEqual([
      { organizationId: "org-a", orgName: "Org A", isAdmin: false, isSuperuser: false },
      { organizationId: "org-b", orgName: "Org B", isAdmin: true, isSuperuser: false },
    ]);
    expect(generateTokenMock).not.toHaveBeenCalled();
  });

  it("split-identity fail-safe: >1 User row for one email -> 401 + notifyError, never picks one", async () => {
    mockUser.findAll.mockResolvedValue([
      makeUser({ id: "user-1", organizationId: "org-a" }),
      makeUser({ id: "user-2", organizationId: "org-b" }),
    ]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(notifyErrorMock).toHaveBeenCalledTimes(1);
    expect(mockUOM.findAll).not.toHaveBeenCalled();
    expect(generateTokenMock).not.toHaveBeenCalled();
  });
});

describe("Phase 5a - no user/email enumeration (identical failure responses)", () => {
  it("unknown-email, wrong-password and no-approved-membership are indistinguishable", async () => {
    // Unknown email.
    mockUser.findAll.mockResolvedValueOnce([]);
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: PASSWORD });

    // Wrong password.
    mockUser.findAll.mockResolvedValueOnce([makeUser()]);
    const wrongPw = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "nope" });

    // Correct password, no approved membership.
    mockUser.findAll.mockResolvedValueOnce([makeUser()]);
    mockUOM.findAll.mockResolvedValueOnce([]);
    const noMember = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: PASSWORD });

    for (const r of [unknown, wrongPw, noMember]) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: "Invalid credentials" });
    }
  });
});

describe("Phase 5a - org-scoped path requires email (#892)", () => {
  it("still requires an email when organizationId is present (validation 400)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ organizationId: "demo-corp", password: PASSWORD });
    expect(res.status).toBe(400);
    // Org-less email path must NOT have run.
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });

  it("rejects a username-only submission with 400 (username is no longer a credential)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ organizationId: "demo-corp", username: "alice", password: PASSWORD });
    expect(res.status).toBe(400);
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });

  it("enforces the email rule when organizationId is present", async () => {
    // email present + org present: validation passes, handler proceeds
    // to the org-scoped path (getTenantId mocked null -> generic 401).
    const res = await request(app)
      .post("/api/auth/login")
      .send({ organizationId: "demo-corp", email: "alice@example.com", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });
});
