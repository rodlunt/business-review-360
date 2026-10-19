/**
 * Phase 5 (#892) - POST /api/auth/discover-providers.
 *
 * Enumeration-safe provider discovery for the unified login UX. The
 * response shape is identical for unknown email, password-only user,
 * no approved membership, and known-email-with-no-configured-providers
 * so a probe cannot distinguish account existence. Returns the subset
 * of [google, github, microsoft, azure-ad] that is BOTH enabled on the
 * org AND has env-var credentials (for azure-ad, plus org.ssoAzureTenantId).
 *
 * Scaffold mirrors onboardingPhase5a.test.js: real validation + handler,
 * collaborators (User, UserOrganizationMembership, Organization,
 * audit/ntfy/recaptcha/tenantResolver) mocked.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "sqlite::memory:";
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || "sqlite::memory:";

import { describe, it, expect, beforeEach, afterAll, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

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

const mockOrg = { findAll: jest.fn(), findOne: jest.fn() };
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

jest.unstable_mockModule("../../backend/src/middleware/tenantResolver.js", () => ({
  getTenantId: jest.fn().mockResolvedValue(null),
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
  resolveTenant: (_req, _res, next) => next(),
}));

jest.unstable_mockModule("../../backend/src/utils/ntfy.js", () => ({
  notifyError: jest.fn().mockResolvedValue(),
  notifyEvent: jest.fn().mockResolvedValue(),
}));

jest.unstable_mockModule("../../backend/src/middleware/auth.js", () => ({
  generateToken: jest.fn(() => ({ token: "issued.jwt.token", jti: "jti-1" })),
  createSession: jest.fn().mockResolvedValue({}),
  ACCESS_TOKEN_TTL_MS: 900000,
  authenticate: (_req, _res, next) => next(),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-discover";
delete process.env.PLATFORM_OWNER_ID;

// Snapshot OAuth credential env vars so per-test mutations don't leak.
const ORIGINAL_ENV = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
};
function setProviderCredentials({ google = true, github = true, microsoft = true } = {}) {
  process.env.GOOGLE_CLIENT_ID = google ? "google-test-id" : "";
  process.env.GOOGLE_CLIENT_SECRET = google ? "google-test-secret" : "";
  process.env.GITHUB_CLIENT_ID = github ? "github-test-id" : "";
  process.env.GITHUB_CLIENT_SECRET = github ? "github-test-secret" : "";
  process.env.MICROSOFT_CLIENT_ID = microsoft ? "ms-test-id" : "";
  process.env.MICROSOFT_CLIENT_SECRET = microsoft ? "ms-test-secret" : "";
}
function restoreProviderCredentials() {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const { publicRouter } = await import("../../backend/src/routes/auth.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", publicRouter);
  return app;
}

const EMPTY = { providers: [], orgId: null };

let app;
beforeEach(() => {
  jest.clearAllMocks();
  setProviderCredentials({ google: true, github: true, microsoft: true });
  mockUser.findAll.mockResolvedValue([]);
  mockUOM.findAll.mockResolvedValue([]);
  mockOrg.findAll.mockResolvedValue([]);
  app = buildApp();
});

afterAll(() => {
  restoreProviderCredentials();
});

describe("POST /api/auth/discover-providers - validation", () => {
  it("400 when no email is supplied (express-validator catches it)", async () => {
    const res = await request(app).post("/api/auth/discover-providers").send({});
    expect(res.status).toBe(400);
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });

  it("400 when email is malformed", async () => {
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/discover-providers - enumeration safety", () => {
  it("returns the empty shape for an unknown email and never queries memberships", async () => {
    mockUser.findAll.mockResolvedValue([]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EMPTY);
    expect(mockUOM.findAll).not.toHaveBeenCalled();
  });

  it("returns the empty shape for a known email with no approved membership", async () => {
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }]);
    mockUOM.findAll.mockResolvedValue([]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "alice@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EMPTY);
    expect(mockOrg.findAll).not.toHaveBeenCalled();
  });

  it("returns the empty shape for a known email whose org has no OAuth flags enabled", async () => {
    // Mirrors the AC's "password-only user" case: a registered email
    // belonging to an org that has no OAuth/SSO flag turned on.
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }]);
    mockUOM.findAll.mockResolvedValue([{ organizationId: "plain-org" }]);
    mockOrg.findAll.mockResolvedValue([
      {
        organizationId: "plain-org",
        oauthGoogleEnabled: false,
        oauthGithubEnabled: false,
        oauthMicrosoftEnabled: false,
        ssoAzureEnabled: false,
        ssoAzureTenantId: null,
      },
    ]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "alice@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EMPTY);
  });

  it("returns the empty shape when a provider is enabled but credentials are missing", async () => {
    setProviderCredentials({ google: false, github: false, microsoft: false });
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }]);
    mockUOM.findAll.mockResolvedValue([{ organizationId: "acme" }]);
    mockOrg.findAll.mockResolvedValue([
      {
        organizationId: "acme",
        oauthGoogleEnabled: true,
        oauthGithubEnabled: true,
        oauthMicrosoftEnabled: true,
        ssoAzureEnabled: true,
        ssoAzureTenantId: "tenant-xyz",
      },
    ]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "alice@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EMPTY);
  });
});

describe("POST /api/auth/discover-providers - happy paths", () => {
  it("returns enabled+configured providers and the orgId for a single-org email", async () => {
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }]);
    mockUOM.findAll.mockResolvedValue([{ organizationId: "acme" }]);
    mockOrg.findAll.mockResolvedValue([
      {
        organizationId: "acme",
        oauthGoogleEnabled: true,
        oauthGithubEnabled: false,
        oauthMicrosoftEnabled: true,
        ssoAzureEnabled: true,
        ssoAzureTenantId: "tenant-xyz",
      },
    ]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "alice@example.com" });
    expect(res.status).toBe(200);
    // Stable order per OAUTH_PROVIDERS catalogue, not org iteration order.
    expect(res.body).toEqual({
      providers: ["google", "microsoft", "azure-ad"],
      orgId: "acme",
    });
  });

  it("returns the union of providers across multi-org membership and omits orgId", async () => {
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }]);
    mockUOM.findAll.mockResolvedValue([{ organizationId: "acme" }, { organizationId: "globex" }]);
    mockOrg.findAll.mockResolvedValue([
      {
        organizationId: "acme",
        oauthGoogleEnabled: true,
        oauthGithubEnabled: false,
        oauthMicrosoftEnabled: false,
        ssoAzureEnabled: false,
        ssoAzureTenantId: null,
      },
      {
        organizationId: "globex",
        oauthGoogleEnabled: false,
        oauthGithubEnabled: true,
        oauthMicrosoftEnabled: true,
        ssoAzureEnabled: false,
        ssoAzureTenantId: null,
      },
    ]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "alice@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      providers: ["google", "github", "microsoft"],
      orgId: null,
    });
  });

  it("omits azure-ad when the org has ssoAzureEnabled but no ssoAzureTenantId", async () => {
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }]);
    mockUOM.findAll.mockResolvedValue([{ organizationId: "acme" }]);
    mockOrg.findAll.mockResolvedValue([
      {
        organizationId: "acme",
        oauthGoogleEnabled: false,
        oauthGithubEnabled: false,
        oauthMicrosoftEnabled: false,
        ssoAzureEnabled: true,
        ssoAzureTenantId: null,
      },
    ]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "alice@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EMPTY);
  });

  it("normalises the email (trim + lowercase) to match registration storage", async () => {
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }]);
    mockUOM.findAll.mockResolvedValue([{ organizationId: "acme" }]);
    mockOrg.findAll.mockResolvedValue([
      {
        organizationId: "acme",
        oauthGoogleEnabled: true,
        oauthGithubEnabled: false,
        oauthMicrosoftEnabled: false,
        ssoAzureEnabled: false,
        ssoAzureTenantId: null,
      },
    ]);
    await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "  Alice@Example.COM  " });
    expect(mockUser.findAll).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });
  });

  it("unions across split-identity rows (multiple User rows per email)", async () => {
    // Defence-in-depth: pre-#858 a single email could exist across more
    // than one User row. The endpoint is read-only and never issues a
    // session, so split identity here is benign - union providers across
    // every matching row's approved memberships.
    mockUser.findAll.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);
    mockUOM.findAll.mockResolvedValue([
      { organizationId: "acme" }, // u-1
      { organizationId: "globex" }, // u-2
    ]);
    mockOrg.findAll.mockResolvedValue([
      {
        organizationId: "acme",
        oauthGoogleEnabled: true,
        oauthGithubEnabled: false,
        oauthMicrosoftEnabled: false,
        ssoAzureEnabled: false,
        ssoAzureTenantId: null,
      },
      {
        organizationId: "globex",
        oauthGoogleEnabled: false,
        oauthGithubEnabled: true,
        oauthMicrosoftEnabled: false,
        ssoAzureEnabled: false,
        ssoAzureTenantId: null,
      },
    ]);
    const res = await request(app)
      .post("/api/auth/discover-providers")
      .send({ email: "alice@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      providers: ["google", "github"],
      orgId: null,
    });
    expect(mockUOM.findAll).toHaveBeenCalledWith({
      where: { userId: ["u-1", "u-2"], isApproved: true },
      attributes: ["organizationId"],
    });
  });
});
