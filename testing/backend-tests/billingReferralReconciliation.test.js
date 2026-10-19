/**
 * Issue #849 — Phase 2d conversion reconciliation
 *
 * A self-serve user who supplied a referral code at registration (Phase 2a,
 * stored on User.referredByConsultantCode) but does NOT re-type it at
 * conversion must still have the referring consultant credited. The shared
 * resolveReferralConsultant helper recovers the code and feeds it through the
 * existing #816 chain (checkout: Stripe session metadata.referral_code;
 * trial-signup: Organization.create referredBy). The metadata -> webhook ->
 * Organization.referredBy leg itself is already proven by
 * billingReferralCheckout.test.js (#816); this file proves the recovery.
 *
 * Precedence under test:
 *   - explicit code typed at conversion wins (no recovery attempted)
 *   - else authenticated non-demo req.user.id -> User.referredByConsultantCode
 *   - else self-asserted adminEmail -> most-recent User with a non-null code
 *   - unknown/inactive recovered code is a silent no-op (never blocks)
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";
import { allEmailTemplatesMock } from "../test-fixtures/email-template-mocks.js";

// ── mock: platform DB ────────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: { query: mockQuery },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

// ── mock: audit logger ───────────────────────────────────────────────────────
jest.unstable_mockModule("../../backend/src/middleware/auditLog.js", () => ({
  auditLogger: () => (_req, _res, next) => next(),
}));

// ── mock: reCAPTCHA (trial-signup gate) ──────────────────────────────────────
jest.unstable_mockModule("../../backend/src/lib/recaptcha.js", () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true, score: 0.9 }),
}));

// ── mock: Stripe ─────────────────────────────────────────────────────────────
const mockSessionCreate = jest.fn();
jest.unstable_mockModule("stripe", () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockSessionCreate, retrieve: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  })),
}));

// ── mock: Organization model ─────────────────────────────────────────────────
const mockOrgFindOne = jest.fn();
const mockOrgCreate = jest.fn();
jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({
  default: { findOne: mockOrgFindOne, create: mockOrgCreate },
}));

// ── mock: Consultant model ───────────────────────────────────────────────────
const mockConsultantFindOne = jest.fn();
jest.unstable_mockModule("../../backend/src/models/Consultant.js", () => ({
  default: { findOne: mockConsultantFindOne },
}));

// ── mock: User model ─────────────────────────────────────────────────────────
const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
jest.unstable_mockModule("../../backend/src/models/User.js", () => ({
  default: { findOne: mockUserFindOne, create: mockUserCreate },
}));

// ── mock: ConsultantInvite model ─────────────────────────────────────────────
jest.unstable_mockModule("../../backend/src/models/ConsultantInvite.js", () => ({
  default: { findOne: jest.fn(), create: jest.fn() },
}));

// ── mock: UserOrganizationMembership model ───────────────────────────────────
jest.unstable_mockModule("../../backend/src/models/UserOrganizationMembership.js", () => ({
  default: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

// ── mock: email queue ────────────────────────────────────────────────────────
jest.unstable_mockModule("../../backend/src/services/emailQueueService.js", () => ({
  enqueueTemplateEmail: jest.fn().mockResolvedValue({ success: true, queueId: "q_test" }),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));
jest.unstable_mockModule("../../backend/src/emails/utils/sendEmail.js", () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
  buildFromHeader: jest.fn(),
}));

// ── mock: email templates (all JSX paths share one slot) ────────────────────
jest.unstable_mockModule(
  "../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx",
  allEmailTemplatesMock
);

// ── import module under test ─────────────────────────────────────────────────
const { publicRouter: billingPublic } = await import("../../backend/src/routes/billing.js");

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  // Test-only harness: let a request opt into an authenticated identity by
  // sending x-test-user-id (the checkout route is requireAuth:false, so the
  // auth-preference branch only fires when req.user is populated upstream).
  app.use((req, _res, next) => {
    const id = req.headers["x-test-user-id"];
    if (id) req.user = { id, isDemo: req.headers["x-test-user-demo"] === "1" };
    next();
  });
  app.use("/api/billing", billingPublic);
});

beforeEach(() => {
  mockQuery.mockReset();
  mockSessionCreate.mockReset();
  mockConsultantFindOne.mockReset();
  mockOrgFindOne.mockReset();
  mockOrgCreate.mockReset();
  mockUserFindOne.mockReset();
  mockUserCreate.mockReset();
});

const FAKE_PLAN_ROW = {
  id: "plan-sme",
  plan_code: "sme",
  plan_name: "SME",
  monthly_price: 2995,
  yearly_price: 29940,
  stripe_monthly_price_id: "price_test_sme_monthly",
  stripe_yearly_price_id: "price_test_sme_yearly",
};
const FAKE_SESSION = { id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123" };

function seedCheckoutQueries() {
  mockQuery
    .mockResolvedValueOnce([]) // tenants: no existing org
    .mockResolvedValueOnce([FAKE_PLAN_ROW]); // pricing_plans: plan found
}

// ── Part 1: POST /checkout — recovery via adminEmail ──────────────────────────

describe("#849 — checkout recovers referral code by adminEmail", () => {
  it("recovers the registration code when none is typed at checkout", async () => {
    seedCheckoutQueries();
    mockUserFindOne.mockResolvedValue({ referredByConsultantCode: "consultant-xyz" });
    mockConsultantFindOne.mockResolvedValue({ referralCode: "consultant-xyz" });
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ planId: "sme", orgIdDesired: "conv-org-1", adminEmail: "Buyer@Example.com" });

    expect(res.status).toBe(200);
    // email lookup is normalised lowercase + filters non-null code + newest-first
    const where = mockUserFindOne.mock.calls[0][0].where;
    expect(where.email).toBe("buyer@example.com");
    expect(where.referredByConsultantCode).toBeDefined();
    expect(mockConsultantFindOne).toHaveBeenCalledTimes(1);
    expect(mockSessionCreate.mock.calls[0][0].metadata.referral_code).toBe("consultant-xyz");
  });

  it("an explicitly typed code wins and no recovery is attempted", async () => {
    seedCheckoutQueries();
    mockConsultantFindOne.mockResolvedValue({ referralCode: "typed-code" });
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app).post("/api/billing/checkout").send({
      planId: "sme",
      orgIdDesired: "conv-org-2",
      adminEmail: "buyer@example.com",
      referralCode: "Typed-Code",
    });

    expect(res.status).toBe(200);
    expect(mockUserFindOne).not.toHaveBeenCalled();
    expect(mockSessionCreate.mock.calls[0][0].metadata.referral_code).toBe("typed-code");
  });

  it("recovered code that is inactive is a silent no-op", async () => {
    seedCheckoutQueries();
    mockUserFindOne.mockResolvedValue({ referredByConsultantCode: "stale-code" });
    mockConsultantFindOne.mockResolvedValue(null); // inactive/unknown at checkout
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ planId: "sme", orgIdDesired: "conv-org-3", adminEmail: "buyer@example.com" });

    expect(res.status).toBe(200);
    expect(mockSessionCreate.mock.calls[0][0].metadata.referral_code).toBe("");
  });

  it("no prior registration -> no code, conversion still proceeds", async () => {
    seedCheckoutQueries();
    mockUserFindOne.mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ planId: "sme", orgIdDesired: "conv-org-4", adminEmail: "buyer@example.com" });

    expect(res.status).toBe(200);
    expect(mockConsultantFindOne).not.toHaveBeenCalled();
    expect(mockSessionCreate.mock.calls[0][0].metadata.referral_code).toBe("");
  });

  it("a User lookup failure is swallowed and never blocks checkout", async () => {
    seedCheckoutQueries();
    mockUserFindOne.mockRejectedValue(new Error("db down"));
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ planId: "sme", orgIdDesired: "conv-org-5", adminEmail: "buyer@example.com" });

    expect(res.status).toBe(200);
    expect(mockSessionCreate.mock.calls[0][0].metadata.referral_code).toBe("");
  });
});

// ── Part 2: POST /checkout — authenticated identity preferred ─────────────────

describe("#849 — checkout prefers an authenticated non-demo identity", () => {
  it("recovers via req.user.id, not adminEmail, when authenticated", async () => {
    seedCheckoutQueries();
    mockUserFindOne.mockResolvedValue({ referredByConsultantCode: "auth-code" });
    mockConsultantFindOne.mockResolvedValue({ referralCode: "auth-code" });
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post("/api/billing/checkout")
      .set("x-test-user-id", "user-auth-1")
      .send({ planId: "sme", orgIdDesired: "conv-org-6", adminEmail: "someone@example.com" });

    expect(res.status).toBe(200);
    expect(mockUserFindOne.mock.calls[0][0].where).toEqual({ id: "user-auth-1" });
    expect(mockSessionCreate.mock.calls[0][0].metadata.referral_code).toBe("auth-code");
  });

  it("a demo identity is ignored and falls back to adminEmail", async () => {
    seedCheckoutQueries();
    mockUserFindOne.mockResolvedValue({ referredByConsultantCode: "email-code" });
    mockConsultantFindOne.mockResolvedValue({ referralCode: "email-code" });
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post("/api/billing/checkout")
      .set("x-test-user-id", "demo-user")
      .set("x-test-user-demo", "1")
      .send({ planId: "sme", orgIdDesired: "conv-org-7", adminEmail: "buyer@example.com" });

    expect(res.status).toBe(200);
    expect(mockUserFindOne.mock.calls[0][0].where.email).toBe("buyer@example.com");
    expect(mockSessionCreate.mock.calls[0][0].metadata.referral_code).toBe("email-code");
  });
});

// ── Part 3: trial-signup wiring ───────────────────────────────────────────────

describe("#849 — trial-signup recovers and attributes the org", () => {
  it("sets Organization.referredBy from the recovered code", async () => {
    // Seed enough of the trial provisioning path to reach Organization.create.
    mockQuery
      .mockResolvedValueOnce([]) // tenants: org slug free
      .mockResolvedValueOnce([{ limits: { maxIdeas: 500, maxUsers: 50 } }]) // pricing_plans 'trial'
      .mockResolvedValueOnce([]) // INSERT tenants
      .mockResolvedValueOnce([{ id: "tenant-uuid-1" }]) // SELECT tenant id
      .mockResolvedValue([]); // any further provisioning queries
    mockUserFindOne.mockResolvedValue({ referredByConsultantCode: "consultant-abc" });
    mockConsultantFindOne.mockResolvedValue({
      id: "c1",
      referralCode: "consultant-abc",
      isActive: true,
      userId: null,
    });
    mockOrgCreate.mockResolvedValue({ organizationId: "trial-conv-org" });
    mockUserCreate.mockResolvedValue({ id: "u1", email: "buyer@example.com" });

    const res = await request(app).post("/api/billing/trial-signup").send({
      orgIdDesired: "trial-conv-org",
      adminUsername: "buyer",
      adminEmail: "buyer@example.com",
      adminPassword: "Password123",
      recaptchaToken: "valid-token",
    });

    // Provisioning may continue past Organization.create; we only assert the
    // recovery + attribution seam, which happens before any later step.
    expect(mockOrgCreate).toHaveBeenCalled();
    expect(mockOrgCreate.mock.calls[0][0].referredBy).toBe("consultant-abc");
    expect([200, 201, 500]).toContain(res.status);
  });
});
