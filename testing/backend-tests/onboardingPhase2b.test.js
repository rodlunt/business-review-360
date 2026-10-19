/**
 * Onboarding plan Phase 2b -- consultant invite pre-creates the demo account.
 *
 * POST /api/consultants/invite (requirePlatformOwner) now pre-provisions a
 * demo-corp account (User + membership, isSuperuser+isAdmin) and emails an
 * activation = /reset-password link (reuses the existing auto-login-on-reset
 * flow; no new endpoint). Falls back to the legacy /consultant-signup URL if
 * the demo tenant cannot be resolved. The legacy POST /signup is the
 * untouched dual-path shim for invites issued before this flow (decision C).
 *
 * Scaffold mirrors consultantRoutes.test.js (real authenticate +
 * requirePlatformOwner, models mocked before the router import).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "sqlite::memory:";
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || "sqlite::memory:";

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { allEmailTemplatesMock } from "../test-fixtures/email-template-mocks.js";

jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: { query: jest.fn() },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
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

const mockConsultantInvite = {
  create: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
};
jest.unstable_mockModule("../../backend/src/models/ConsultantInvite.js", () => ({
  default: mockConsultantInvite,
}));

const mockConsultant = { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn() };
jest.unstable_mockModule("../../backend/src/models/Consultant.js", () => ({
  default: mockConsultant,
}));

const mockUser = { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() };
jest.unstable_mockModule("../../backend/src/models/User.js", () => ({ default: mockUser }));

const mockUOM = {
  create: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue(null),
};
jest.unstable_mockModule("../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: mockUOM,
}));

const sendTemplateEmailMock = jest.fn().mockResolvedValue({});
jest.unstable_mockModule("../../backend/src/emails/utils/sendEmail.js", () => ({
  sendTemplateEmail: sendTemplateEmailMock,
  buildFromHeader: jest.fn(),
}));

const getTenantIdMock = jest.fn();
jest.unstable_mockModule("../../backend/src/middleware/tenantResolver.js", () => ({
  getTenantId: getTenantIdMock,
  resolveTenant: (_req, _res, next) => next(),
}));

jest.unstable_mockModule("../../backend/src/utils/withTenantContext.js", () => ({
  withTenantContext: jest.fn().mockImplementation((_tenantId, fn) => fn()),
}));

jest.unstable_mockModule(
  "../../backend/src/emails/templates/consultants/ConsultantInviteEmail.jsx",
  allEmailTemplatesMock
);

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-phase2b";
process.env.JWT_SECRET = JWT_SECRET;

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000b1";
const superuserId = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000b2";
process.env.PLATFORM_OWNER_ID = ownerId;

const ownerToken = jwt.sign({ id: ownerId, organizationId: "admin-org" }, JWT_SECRET, {
  expiresIn: "1h",
});
const superuserToken = jwt.sign({ id: superuserId, organizationId: "admin-org" }, JWT_SECRET, {
  expiresIn: "1h",
});

const authUsers = {
  [ownerId]: {
    id: ownerId,
    username: "owner",
    isAdmin: true,
    isSuperuser: true,
    organizationId: "admin-org",
  },
  [superuserId]: {
    id: superuserId,
    username: "super",
    isAdmin: true,
    isSuperuser: true,
    organizationId: "admin-org",
  },
};

const { publicRouter, protectedRouter } = await import("../../backend/src/routes/consultants.js");
const { authenticate } = await import("../../backend/src/middleware/auth.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/consultants", publicRouter);
  app.use("/api/consultants", authenticate, protectedRouter);
  return app;
}

// Phase 3 Slice 3 (#851): the activation link now carries &activation=1 so
// LostPasswordForm renders activation-flavoured copy. Mechanics unchanged.
const RESET_URL =
  /^https:\/\/demo-corp\.br360\.example\.com\/reset-password\?token=[a-f0-9]+&activation=1$/;
const LEGACY_URL = /\/consultant-signup\?invite=/;

let app;
beforeEach(() => {
  jest.clearAllMocks();
  // authenticate -> User.findByPk for the bearer's id.
  mockUser.findByPk.mockImplementation(async (id) => authUsers[id] ?? null);
  mockUOM.create.mockResolvedValue({});
  mockUOM.findOne.mockResolvedValue(null);
  mockConsultantInvite.create.mockResolvedValue({
    id: "invite-1",
    token: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
    email: "consultant@example.com",
    firstName: "Casey",
    commissionRate: 0.3,
    expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  sendTemplateEmailMock.mockResolvedValue({});
  app = buildApp();
});

const inviteBody = { email: "consultant@example.com", firstName: "Casey", lastName: "Jones" };

function emailedSignupUrl() {
  const call = sendTemplateEmailMock.mock.calls.at(-1)[0];
  return call.templateProps.signupUrl;
}

describe("Phase 2b -- POST /api/consultants/invite pre-provisions the demo account", () => {
  it("creates the user + membership and emails an activation (reset) link", async () => {
    getTenantIdMock.mockResolvedValue("tenant-demo");
    mockUser.findOne.mockResolvedValue(null); // no existing demo account
    mockUser.create.mockResolvedValue({ id: "demo-user-1" });

    const res = await request(app)
      .post("/api/consultants/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(inviteBody);

    expect(res.status).toBe(201);
    expect(mockConsultantInvite.create).toHaveBeenCalled();
    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "consultant@example.com",
        organizationId: "demo-corp",
        isAdmin: true,
        isSuperuser: true,
        isApproved: true,
      })
    );
    expect(mockUOM.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "demo-user-1",
        organizationId: "demo-corp",
        isAdmin: true,
        isSuperuser: true,
      })
    );
    expect(emailedSignupUrl()).toMatch(RESET_URL);
  });

  it("refreshes the reset token for an already-provisioned account (no duplicate create)", async () => {
    getTenantIdMock.mockResolvedValue("tenant-demo");
    const updateMock = jest.fn().mockResolvedValue(undefined);
    mockUser.findOne.mockResolvedValue({ id: "demo-user-1", update: updateMock });

    const res = await request(app)
      .post("/api/consultants/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(inviteBody);

    expect(res.status).toBe(201);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ passwordResetToken: expect.any(String) })
    );
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(emailedSignupUrl()).toMatch(RESET_URL);
  });

  it("falls back to the legacy signup URL when the demo tenant cannot be resolved", async () => {
    getTenantIdMock.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/consultants/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(inviteBody);

    expect(res.status).toBe(201);
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(emailedSignupUrl()).toMatch(LEGACY_URL);
  });

  it("still requires the platform owner (superuser who is not owner gets 403)", async () => {
    const res = await request(app)
      .post("/api/consultants/invite")
      .set("Authorization", `Bearer ${superuserToken}`)
      .send(inviteBody);

    expect(res.status).toBe(403);
    expect(mockConsultantInvite.create).not.toHaveBeenCalled();
  });
});
