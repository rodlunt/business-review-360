/**
 * #892 PR4 -- magic-link guest access.
 *
 * POST /api/auth/magic-link          request a one-time sign-in link
 * POST /api/auth/magic-link/redeem   consume it (real User row + demo-corp
 *                                     membership + session, REAL-ROWS shape)
 *
 * Scaffold mirrors demoSignupEndpoint.test.js (register-capable transaction
 * + tenant-DB mock pattern + oauth.js findUniqueUsername mock).
 *
 * Rate-limit test note: mirrors billingRateLimitAndCache.test.js. .env.test
 * sets DISABLE_RATE_LIMIT=true (the hermetic-test convention -- CLAUDE.md),
 * so rateLimiters.passwordReset would be a no-op passthrough for this whole
 * file unless the flag is cleared BEFORE security.js is ever imported
 * (disableRate is computed once at module load, not read per-request). The
 * `app` used by every other test in this file mounts only the router
 * (authPublic), never the limiter, so clearing the flag here does not make
 * any other test in this file rate-limited -- only `rlApp` below is.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "sqlite::memory:";
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || "sqlite::memory:";
delete process.env.DISABLE_RATE_LIMIT;

import { jest } from "@jest/globals";

const JWT_SECRET = "test-secret-magic-link-pr4";
process.env.JWT_SECRET = JWT_SECRET;
delete process.env.DEMO_ORG_ID;
delete process.env.PLATFORM_OWNER_ID;

const realJwt = (await import("jsonwebtoken")).default;

const mockUser = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  findByPk: jest.fn(),
};
const mockUOM = { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() };
const mockOrg = { findOne: jest.fn(), findAll: jest.fn() };
const mockMagicLinkToken = { create: jest.fn(), update: jest.fn() };
const mockSequelize = { transaction: jest.fn(), query: jest.fn() };
const mockPlatformSequelize = { query: jest.fn() };
const mockGenerateToken = jest.fn(() => ({ token: "guest-jwt", jti: "jti-guest" }));
const mockCreateSession = jest.fn().mockResolvedValue({});
const findUniqueUsernameMock = jest.fn().mockResolvedValue("guest_visitor");
const sendMagicLinkEmailMock = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule("../../backend/src/models/User.js", () => ({ default: mockUser }));
jest.unstable_mockModule("../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: mockUOM,
}));
jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({ default: mockOrg }));
jest.unstable_mockModule("../../backend/src/models/MagicLinkToken.js", () => ({
  default: mockMagicLinkToken,
}));
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
  notifyEvent: jest.fn().mockResolvedValue(),
}));
jest.unstable_mockModule("../../backend/src/services/notificationEmailService.js", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: sendMagicLinkEmailMock,
}));
// The redeem handler dynamically imports findUniqueUsername from oauth.js.
jest.unstable_mockModule("../../backend/src/routes/oauth.js", () => ({
  findUniqueUsername: findUniqueUsernameMock,
  publicRouter: { post: () => {}, get: () => {} },
  protectedRouter: { post: () => {}, get: () => {} },
}));

const { publicRouter: authPublic } = await import("../../backend/src/routes/auth.js");
const { rateLimiters } = await import("../../backend/src/middleware/security.js");
const { describe, it, expect, beforeEach } = await import("@jest/globals");
const request = (await import("supertest")).default;
const express = (await import("express")).default;

const app = express();
app.use(express.json());
app.use("/api/auth", authPublic);

// A second app instance mounts the SAME rateLimiters.passwordReset
// middleware in front of the router, exactly as index.js does for
// /api/auth/magic-link -- reusing the real limiter function (not a
// re-implementation) is how the rate-limit test below stays honest about
// "reuse the reset-password arrangement".
function buildRateLimitedApp() {
  const rlApp = express();
  rlApp.use(express.json());
  rlApp.use("/api/auth/magic-link", rateLimiters.passwordReset);
  rlApp.use("/api/auth", authPublic);
  return rlApp;
}

const fakeTx = Symbol("tx");

function signMagicLinkToken({ email, jti = "jti-1", expiresIn = "15m", secret = JWT_SECRET } = {}) {
  return realJwt.sign({ email, purpose: "magic-link" }, secret, {
    expiresIn,
    algorithm: "HS256",
    jwtid: jti,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTx));
  mockSequelize.query.mockResolvedValue([[], []]);
  mockPlatformSequelize.query.mockResolvedValue([{ id: "tenant-democorp" }]);
  mockOrg.findOne.mockResolvedValue({ organizationId: "demo-corp", organizationName: "Demo Corp" });
  mockUser.findOne.mockResolvedValue(null);
  mockUser.create.mockImplementation(async (attrs) => ({
    id: "u-guest-1",
    ...attrs,
    update: jest.fn().mockResolvedValue(undefined),
  }));
  mockUOM.findOne.mockResolvedValue(null);
  // Realistic created-membership row: the redeem response reports these
  // flags, so the mock must carry them like the real row does.
  mockUOM.create.mockResolvedValue({ isAdmin: false, isSuperuser: false, isApproved: true });
  mockMagicLinkToken.create.mockResolvedValue({});
  mockMagicLinkToken.update.mockResolvedValue([1]);
  mockGenerateToken.mockReturnValue({ token: "guest-jwt", jti: "jti-guest" });
  mockCreateSession.mockResolvedValue({});
  findUniqueUsernameMock.mockResolvedValue("guest_visitor");
  sendMagicLinkEmailMock.mockResolvedValue(true);
});

describe("POST /api/auth/magic-link -- request", () => {
  it("returns the identical 200 body whether or not a User row exists for the email", async () => {
    // Deliberately does NOT prime mockUser.findOne with a per-call
    // mockResolvedValueOnce: the request handler never queries User at all
    // (asserted below), so priming would just leave an unconsumed queued
    // value to leak into a later test.
    const resUnknown = await request(app)
      .post("/api/auth/magic-link")
      .send({ email: "unknown@example.com" });

    const resKnown = await request(app)
      .post("/api/auth/magic-link")
      .send({ email: "known@example.com" });

    expect(resUnknown.status).toBe(200);
    expect(resKnown.status).toBe(200);
    expect(resUnknown.body).toEqual(resKnown.body);
    expect(resUnknown.body).toEqual({
      success: true,
      message: "If that address can receive mail, a sign-in link is on its way.",
    });
    // The handler never even queries User -- there is nothing for it to
    // branch on, which is why the response is structurally invariant
    // rather than merely coincidentally identical.
    expect(mockUser.findOne).not.toHaveBeenCalled();
  });

  it("returns the identical 200 body even when the downstream email send fails", async () => {
    sendMagicLinkEmailMock.mockRejectedValueOnce(new Error("provider outage"));
    const res = await request(app).post("/api/auth/magic-link").send({ email: "a@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: "If that address can receive mail, a sign-in link is on its way.",
    });
  });

  it("enqueues the email and stores a MagicLinkToken record for a valid email", async () => {
    const res = await request(app)
      .post("/api/auth/magic-link")
      .send({ email: "  Guest@Example.COM  " });

    expect(res.status).toBe(200);
    expect(mockMagicLinkToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "guest@example.com", jti: expect.any(String) })
    );
    expect(sendMagicLinkEmailMock).toHaveBeenCalledWith(
      "guest@example.com",
      expect.any(String)
    );
  });

  it("400s on a missing/invalid email without touching the token store", async () => {
    const res = await request(app).post("/api/auth/magic-link").send({});
    expect(res.status).toBe(400);
    expect(mockMagicLinkToken.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/magic-link -- rate limiting (reuses rateLimiters.passwordReset)", () => {
  it("429s after 3 requests/hour from the same IP, matching reset-password's limit", async () => {
    // DISABLE_RATE_LIMIT was cleared at the top of this file (before
    // security.js was ever imported), so rateLimiters.passwordReset here is
    // the real express-rate-limit instance -- the same shared limiter
    // /api/auth/request-password-reset, /recover and /reset-password use,
    // reused rather than re-implemented (index.js mounts it identically for
    // /api/auth/magic-link). Every other test in this file uses `app`
    // directly (router only, no limiter mounted), so this is the only test
    // file-wide that is actually rate-limited.
    const rlApp = buildRateLimitedApp();
    const hit = () => request(rlApp).post("/api/auth/magic-link").send({ email: "x@example.com" });

    const results = [];
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await hit());
    }

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(3);
    expect(statuses).toContain(429);
  });
});

// DISABLE_RATE_LIMIT=true is the hermetic-test default (.env.test): every
// OTHER test in this file exercises `app`, which mounts the router without
// the limiter, so they already prove the request/redeem handlers work
// independently of rate-limiter state -- the same posture
// billingRateLimitAndCache.test.js documents for its own suite.

describe("POST /api/auth/magic-link/redeem -- happy path", () => {
  it("creates a User row + demo-corp membership + session for a brand new email", async () => {
    const token = signMagicLinkToken({ email: "newguest@example.com", jti: "jti-new" });
    const res = await request(app).post("/api/auth/magic-link/redeem").send({ token });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("guest-jwt");
    expect(res.body.user).toMatchObject({ id: "u-guest-1", organizationId: "demo-corp" });

    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "newguest@example.com",
        username: "guest_visitor",
        passwordHash: null,
        isAnonymous: false,
        isApproved: true,
        organizationId: "demo-corp",
        signupSource: "magic-link",
      }),
      expect.objectContaining({ transaction: fakeTx })
    );
    expect(mockUOM.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-guest-1",
        organizationId: "demo-corp",
        isAdmin: false,
        isApproved: true,
        isSuperuser: false,
      }),
      expect.objectContaining({ transaction: fakeTx })
    );
    // The redeem handler looks up an existing account by email via
    // findOne (not findByPk) before deciding whether to create one.
    expect(mockUser.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "newguest@example.com" } })
    );
    expect(mockMagicLinkToken.update).toHaveBeenCalledWith(
      { consumedAt: expect.any(Date) },
      { where: { jti: "jti-new", consumedAt: null } }
    );
  });

  it("reuses an existing User row unchanged and does not duplicate the membership", async () => {
    mockUser.findOne.mockResolvedValue({
      id: "u-existing-1",
      email: "existing@example.com",
      username: "existing_user",
      organizationId: "acme-corp",
      update: jest.fn().mockResolvedValue(undefined),
    });
    mockUOM.findOne.mockResolvedValue({ userId: "u-existing-1", organizationId: "demo-corp" });

    const token = signMagicLinkToken({ email: "existing@example.com", jti: "jti-existing" });
    const res = await request(app).post("/api/auth/magic-link/redeem").send({ token });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("u-existing-1");
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockUOM.create).not.toHaveBeenCalled();
    // Session is still demo-corp-scoped even though the user's home org
    // (organizationId on the row) is a different tenant.
    expect(mockGenerateToken).toHaveBeenCalledWith("u-existing-1", "demo-corp");
  });

  it("reflects an existing demo-corp membership's real flags instead of hardcoding plain-member values", async () => {
    // e.g. a fixture admin redeeming a guest link: the link grants nothing,
    // but the response must report the membership row's actual flags so the
    // UI does not render an admin as a plain member until the next /me.
    mockUser.findOne.mockResolvedValue({
      id: "u-dcadmin",
      email: "admin@democorp.com",
      username: "dcadmin",
      organizationId: "demo-corp",
      update: jest.fn().mockResolvedValue(undefined),
    });
    mockUOM.findOne.mockResolvedValue({
      userId: "u-dcadmin",
      organizationId: "demo-corp",
      isAdmin: true,
      isSuperuser: false,
      isApproved: true,
    });

    const token = signMagicLinkToken({ email: "admin@democorp.com", jti: "jti-admin" });
    const res = await request(app).post("/api/auth/magic-link/redeem").send({ token });

    expect(res.status).toBe(200);
    expect(res.body.user.isAdmin).toBe(true);
    expect(res.body.user.isSuperuser).toBe(false);
    expect(mockUOM.create).not.toHaveBeenCalled();
  });

  it("second redeem of the same token fails (single-use)", async () => {
    const token = signMagicLinkToken({ email: "onceonly@example.com", jti: "jti-once" });

    mockMagicLinkToken.update.mockResolvedValueOnce([1]);
    const first = await request(app).post("/api/auth/magic-link/redeem").send({ token });
    expect(first.status).toBe(200);

    // Simulate the DB-side effect of the first redeem: the atomic WHERE
    // consumedAt IS NULL clause now matches zero rows.
    mockMagicLinkToken.update.mockResolvedValueOnce([0]);
    const second = await request(app).post("/api/auth/magic-link/redeem").send({ token });

    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/invalid or expired/i);
  });

  it("rejects an expired token", async () => {
    const token = signMagicLinkToken({ email: "late@example.com", jti: "jti-late", expiresIn: "-1s" });
    const res = await request(app).post("/api/auth/magic-link/redeem").send({ token });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
    expect(mockMagicLinkToken.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/magic-link/redeem -- purpose-binding (both directions)", () => {
  it("rejects a same-secret HS256 JWT that lacks purpose='magic-link' (e.g. an org-pick token)", async () => {
    const orgPickToken = realJwt.sign({ id: "some-user-id", step: "org-pick" }, JWT_SECRET, {
      expiresIn: "5m",
      algorithm: "HS256",
    });

    const res = await request(app)
      .post("/api/auth/magic-link/redeem")
      .send({ token: orgPickToken });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("rejects a same-secret HS256 JWT with email+jti present but the wrong purpose claim", async () => {
    // Isolates the purpose check from the email/jti presence checks: this
    // token has everything else a magic-link token has, differing only in
    // `purpose`. A weakened check that dropped the purpose comparison (but
    // kept the email/jti presence checks) would wrongly accept this.
    const wrongPurposeToken = realJwt.sign(
      { email: "guest@example.com", purpose: "password-reset" },
      JWT_SECRET,
      { expiresIn: "15m", algorithm: "HS256", jwtid: "jti-wrong-purpose" }
    );

    const res = await request(app)
      .post("/api/auth/magic-link/redeem")
      .send({ token: wrongPurposeToken });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it("rejects a reset-password-style raw token (not a JWT at all)", async () => {
    const rawResetToken = "a".repeat(64); // shape of the sha256-hex reset token
    const res = await request(app)
      .post("/api/auth/magic-link/redeem")
      .send({ token: rawResetToken });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it("vice versa: a magic-link token carries no step claim, so /select-org rejects it", async () => {
    const magicLinkToken = signMagicLinkToken({ email: "guest@example.com" });
    const res = await request(app)
      .post("/api/auth/select-org")
      .send({ pickToken: magicLinkToken, organizationId: "demo-corp" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid token type/i);
  });
});
