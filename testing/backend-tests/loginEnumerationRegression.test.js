/**
 * Issue #587 regression guard, updated for Phase 5 slice 5a (#858).
 *
 * Original #587 invariant: POST /api/auth/login must never answer 500
 * for a missing/empty organizationId. A 500-vs-401 split lets a bot
 * distinguish "valid shape, bad creds" from "request missing org" and is
 * a user/org enumeration channel (OWASP ASVS 2.2.3 / 7.1.1). Original
 * root cause: getTenantByOrganizationId(undefined) threw and propagated
 * as 500.
 *
 * Phase 5a contract change: a missing organizationId is no longer an
 * error; it is the org-less login mode, whose credential is `email`.
 * The handler now never calls getTenantId on the org-less path, so the
 * original 500 root cause is structurally removed for the missing-org
 * case. The enumeration invariant is preserved and re-expressed here:
 *
 *  - No credentials (no org, no email)  -> 400 validation error. This is
 *    a request-shape error that is IDENTICAL for every input lacking the
 *    email credential and is independent of any account/org existence,
 *    so it is not an enumeration channel (same class as "password
 *    required"). It must NOT be 500.
 *  - Valid org-less shape, unknown email -> 401 Invalid credentials,
 *    never 500, and indistinguishable from wrong-password /
 *    no-approved-membership (full enumeration parity is covered in
 *    onboardingPhase5a.test.js).
 *  - Org-scoped path, non-resolving org -> still 401 (not 500): the
 *    literal original #587 guard.
 */
import { jest } from "@jest/globals";

jest.unstable_mockModule("../../backend/src/services/notificationEmailService.js", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));

const mockUser = { findAll: jest.fn().mockResolvedValue([]), findByPk: jest.fn() };
jest.unstable_mockModule("../../backend/src/models/User.js", () => ({ default: mockUser }));

const mockUOM = { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
jest.unstable_mockModule("../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: mockUOM,
}));

jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({
  default: { findAll: jest.fn().mockResolvedValue([]) },
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

jest.unstable_mockModule("../../backend/src/utils/ntfy.js", () => ({
  notifyError: jest.fn().mockResolvedValue(),
  notifyEvent: jest.fn().mockResolvedValue(),
}));

import { describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import express from "express";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-587";

const { publicRouter: authPublic } = await import("../../backend/src/routes/auth.js");

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use("/api/auth", authPublic);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.findAll.mockResolvedValue([]);
  mockUOM.findAll.mockResolvedValue([]);
  getTenantIdMock.mockResolvedValue(null);
});

describe("Issue #587 / Phase 5a - login never leaks via a 500 status split", () => {
  it("no org and no email -> 400 validation error, never 500, account-independent", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "whatever" });

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
    // Request-shape error only: must not have queried any account.
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });

  it("empty-string org and no email -> 400, never 500 (the old empty-org 500 case)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "whatever", organizationId: "" });

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
    expect(mockUser.findAll).not.toHaveBeenCalled();
  });

  it("valid org-less shape, unknown email -> 401 Invalid credentials, never 500", async () => {
    mockUser.findAll.mockResolvedValue([]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@example.com", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.status).not.toBe(500);
    expect(res.body).toEqual({ error: "Invalid credentials" });
  });

  it("org-scoped path with a non-resolving org -> 401, never 500 (literal #587 guard)", async () => {
    getTenantIdMock.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ organizationId: "no-such-org", email: "alice@example.com", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.status).not.toBe(500);
    expect(res.body).toEqual({ error: "Invalid credentials" });
  });
});
