/**
 * #892 PR 4 -- main-domain OAuth no-org flow.
 *
 * Initiate endpoint: when /api/auth/oauth/:provider is hit without ?org=,
 * the handler runs the no-org branch (state payload gets noOrg:true) and
 * redirects to the provider with platform-level (env-keyed) client_id.
 *
 * Callback: with state.noOrg=true the handler looks up the OAuth identity
 * by email and routes to one of:
 *   - 0 User rows                 -> creates a User in the shared self-serve
 *                                    tenant (signupSource='oauth-no-org',
 *                                    NO membership) + welcome redirect.
 *   - 1 row, 0 approved members   -> welcome redirect (no User creation).
 *   - 1 row, 1 approved member    -> issues a session and redirects to that
 *                                    org's subdomain (org-scoped callback URL).
 *   - 1 row, 2+ members           -> stop-gap multi-org banner redirect.
 *   - >1 rows                     -> split-identity error redirect.
 *
 * Scaffold mirrors loginEnumerationRegression.test.js: real validation +
 * handler, models + side-effect modules mocked. global.fetch is intercepted
 * for the provider token-exchange + profile fetches.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "sqlite::memory:";
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || "sqlite::memory:";

import { jest } from "@jest/globals";

const JWT_SECRET = "test-secret-oauth-no-org-pr4";
process.env.JWT_SECRET = JWT_SECRET;
process.env.GOOGLE_CLIENT_ID = "google-client-test";
process.env.GOOGLE_CLIENT_SECRET = "google-secret-test";
process.env.GITHUB_CLIENT_ID = "github-client-test";
process.env.GITHUB_CLIENT_SECRET = "github-secret-test";
process.env.MICROSOFT_CLIENT_ID = "ms-client-test";
process.env.MICROSOFT_CLIENT_SECRET = "ms-secret-test";
process.env.FRONTEND_URL = "https://www.example.test";
process.env.OAUTH_CALLBACK_BASE_URL = "https://api.example.test";

const mockUser = {
  findOne: jest.fn(),
  findAll: jest.fn().mockResolvedValue([]),
  findByPk: jest.fn(),
  create: jest.fn(),
};
const mockOAuthLink = { findOne: jest.fn(), create: jest.fn() };
const mockUOM = { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn() };
const mockOrg = { findOne: jest.fn(), findAll: jest.fn() };
const mockGenerateToken = jest.fn(() => ({ token: "issued-jwt", jti: "jti-1" }));
const mockCreateSession = jest.fn().mockResolvedValue({});
const getTenantByOrganizationIdMock = jest.fn().mockResolvedValue({ id: "tenant-democorp" });
const notifyEventMock = jest.fn().mockResolvedValue();

jest.unstable_mockModule("../../backend/src/models/User.js", () => ({ default: mockUser }));
jest.unstable_mockModule("../../backend/src/models/OAuthLink.js", () => ({ default: mockOAuthLink }));
jest.unstable_mockModule("../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: mockUOM,
}));
jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({ default: mockOrg }));
jest.unstable_mockModule("../../backend/src/middleware/tenantResolver.js", () => ({
  getTenantByOrganizationId: getTenantByOrganizationIdMock,
  getTenantId: jest.fn().mockResolvedValue(null),
  resolveTenant: (_req, _res, next) => next(),
}));
jest.unstable_mockModule("../../backend/src/middleware/auth.js", () => ({
  authenticate: (_req, _res, next) => next(),
  generateToken: mockGenerateToken,
  createSession: mockCreateSession,
  ACCESS_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
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
jest.unstable_mockModule("../../backend/src/emails/utils/sendEmail.js", () => ({
  sendRawEmail: jest.fn().mockResolvedValue(true),
}));

const { publicRouter: oauthPublic } = await import("../../backend/src/routes/oauth.js");
const { describe, it, expect, beforeEach } = await import("@jest/globals");
const request = (await import("supertest")).default;
const express = (await import("express")).default;
const jwt = (await import("jsonwebtoken")).default;

const app = express();
app.use(express.json());
app.use("/api/auth/oauth", oauthPublic);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.findAll.mockResolvedValue([]);
  mockUser.create.mockImplementation(async (attrs) => ({
    id: "u-new-1",
    update: jest.fn().mockResolvedValue(undefined),
    ...attrs,
  }));
  mockOAuthLink.create.mockResolvedValue({});
  mockUOM.findAll.mockResolvedValue([]);
  mockGenerateToken.mockReturnValue({ token: "issued-jwt", jti: "jti-1" });
  mockCreateSession.mockResolvedValue({});
  getTenantByOrganizationIdMock.mockResolvedValue({ id: "tenant-democorp" });
});

describe("GET /api/auth/oauth/:provider -- no-org initiate", () => {
  it("redirects to Google with state.noOrg=true when ?org= is omitted", async () => {
    const res = await request(app).get("/api/auth/oauth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com/);
    const url = new URL(res.headers.location);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    const decoded = jwt.verify(state, JWT_SECRET);
    expect(decoded.noOrg).toBe(true);
    expect(decoded.orgId).toBeUndefined();
  });

  it("rejects azure-ad on the no-org path with 400 (per-tenant provider)", async () => {
    const res = await request(app).get("/api/auth/oauth/azure-ad");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/azure sso/i);
  });

  it("rejects an unknown provider with 400", async () => {
    const res = await request(app).get("/api/auth/oauth/myspace");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown provider/i);
  });

  it("uses platform-level (env) clientId, not per-tenant org settings", async () => {
    const res = await request(app).get("/api/auth/oauth/microsoft");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.searchParams.get("client_id")).toBe("ms-client-test");
    // No DB lookup for an Organization should have happened on the no-org path.
    expect(mockOrg.findOne).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/oauth/:provider/callback -- no-org callback", () => {
  function signNoOrgState() {
    return jwt.sign({ noOrg: true, nonce: "n1", action: "login" }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "10m",
    });
  }

  function mockProviderFetch(profileBody) {
    // Two fetches: token exchange (returns access_token), profile.
    let call = 0;
    global.fetch = jest.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          json: async () => ({ access_token: "fake-access-token", token_type: "Bearer" }),
        };
      }
      return { ok: true, json: async () => profileBody };
    });
  }

  it("creates a User in demo-corp tenant with signupSource=oauth-no-org and redirects to /login welcome when no User exists", async () => {
    mockProviderFetch({ sub: "google-id-1", email: "sarah@acme.example", name: "Sarah Chen" });
    mockUser.findAll.mockResolvedValue([]);

    const state = signNoOrgState();
    const res = await request(app)
      .get("/api/auth/oauth/google/callback")
      .query({ code: "auth-code-1", state });

    expect(res.status).toBe(302);
    const loc = res.headers.location;
    expect(loc.startsWith("https://www.example.test/login")).toBe(true);
    expect(loc).toContain("msg=oauth-no-org");
    expect(loc).toContain("name=Sarah");

    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "sarah@acme.example",
        tenant_id: "tenant-democorp",
        signupSource: "oauth-no-org",
        passwordHash: null,
        isApproved: true,
      })
    );
    expect(mockOAuthLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        providerId: "google-id-1",
        organizationId: null,
      })
    );
    expect(notifyEventMock).toHaveBeenCalledTimes(1);
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it("redirects to /login welcome (no User creation) when the email exists with no approved memberships", async () => {
    mockProviderFetch({ sub: "google-id-2", email: "existing@example.com", name: "Existing User" });
    mockUser.findAll.mockResolvedValue([{ id: "u-existing", email: "existing@example.com" }]);
    mockUOM.findAll.mockResolvedValue([]);

    const state = signNoOrgState();
    const res = await request(app)
      .get("/api/auth/oauth/google/callback")
      .query({ code: "auth-code-2", state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("msg=oauth-no-org");
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it("issues a session and redirects to the org subdomain when the user has exactly 1 approved membership", async () => {
    mockProviderFetch({ sub: "google-id-3", email: "one-org@example.com", name: "Solo User" });
    mockUser.findAll.mockResolvedValue([
      { id: "u-solo", email: "one-org@example.com", organizationId: "acme-corp", update: jest.fn() },
    ]);
    mockUOM.findAll.mockResolvedValue([{ userId: "u-solo", organizationId: "acme-corp" }]);

    const state = signNoOrgState();
    const res = await request(app)
      .get("/api/auth/oauth/google/callback")
      .query({ code: "auth-code-3", state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/org/acme-corp/oauth-callback");
    expect(res.headers.location).toContain("token=issued-jwt");
    expect(mockGenerateToken).toHaveBeenCalledWith("u-solo", "acme-corp");
    expect(mockCreateSession).toHaveBeenCalled();
  });

  it("redirects to /login with msg=oauth-multi-org when the user has 2+ approved memberships", async () => {
    mockProviderFetch({ sub: "google-id-4", email: "consultant@example.com", name: "Consultant" });
    mockUser.findAll.mockResolvedValue([{ id: "u-consult", email: "consultant@example.com" }]);
    mockUOM.findAll.mockResolvedValue([
      { userId: "u-consult", organizationId: "org-a" },
      { userId: "u-consult", organizationId: "org-b" },
    ]);

    const state = signNoOrgState();
    const res = await request(app)
      .get("/api/auth/oauth/google/callback")
      .query({ code: "auth-code-4", state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("msg=oauth-multi-org");
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it("fails closed (split_identity) when 2+ User rows share the same email", async () => {
    mockProviderFetch({ sub: "google-id-5", email: "split@example.com", name: "Split Identity" });
    mockUser.findAll.mockResolvedValue([
      { id: "u-a", email: "split@example.com" },
      { id: "u-b", email: "split@example.com" },
    ]);

    const state = signNoOrgState();
    const res = await request(app)
      .get("/api/auth/oauth/google/callback")
      .query({ code: "auth-code-5", state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=split_identity");
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });
});
