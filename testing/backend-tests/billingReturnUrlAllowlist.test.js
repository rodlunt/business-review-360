/**
 * #820 hardening regression guard.
 *
 * POST /api/billing/customer-portal validates the caller-supplied
 * returnUrl against an origin allowlist before handing it to Stripe as
 * the post-portal redirect. The original check used
 * rawReturnUrl.startsWith(allowedOrigin), which an allowed origin being
 * a STRING PREFIX of a look-alike host defeats:
 * https://br360.example.com.attacker.com/phish startsWith
 * https://br360.example.com -> true -> attacker redirect passed
 * through. The fix compares the parsed URL ORIGIN exactly.
 *
 * Scaffold mirrors billingSessionAuth.test.js (mandatory stripe / auth /
 * auditLog / platformDB / Organization / email mocks; see its header).
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";
import { allEmailTemplatesMock } from "../test-fixtures/email-template-mocks.js";

process.env.FRONTEND_URL = "https://app.br360.example.com";

const billingPortalCreateMock = jest.fn();
jest.unstable_mockModule("stripe", () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: jest.fn(), create: jest.fn() } },
    billingPortal: { sessions: { create: billingPortalCreateMock } },
  })),
}));

jest.unstable_mockModule("../../backend/src/middleware/auth.js", () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 1, organizationId: "org-a" };
    next();
  },
  requireSameOrganization: (req, res, next) => next(),
  generateToken: jest.fn(),
  createSession: jest.fn().mockResolvedValue({}),
  generateDemoToken: jest.fn(),
  requireAdmin: (req, res, next) => next(),
  ACCESS_TOKEN_TTL_MS: 900000,
}));

jest.unstable_mockModule("../../backend/src/middleware/auditLog.js", () => ({
  auditLogger: () => (req, res, next) => next(),
}));

const platformQueryMock = jest.fn();
jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: { query: platformQueryMock },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../../backend/src/models/Organization.js", () => ({
  default: { findOne: jest.fn(), create: jest.fn() },
}));

jest.unstable_mockModule("../../backend/src/services/emailQueueService.js", () => ({
  enqueueTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));
jest.unstable_mockModule("../../backend/src/emails/utils/sendEmail.js", () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
}));
jest.unstable_mockModule(
  "../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx",
  allEmailTemplatesMock
);

const { publicRouter: billingPublic, protectedRouter: billingProtected } = await import(
  "../../backend/src/routes/billing.js"
);
const { authenticate } = await import("../../backend/src/middleware/auth.js");

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use("/api/billing", billingPublic);
  app.use("/api/billing", authenticate, billingProtected);
});

beforeEach(() => {
  billingPortalCreateMock.mockReset();
  billingPortalCreateMock.mockResolvedValue({ url: "https://billing.stripe.com/session/x" });
  platformQueryMock.mockReset();
  // 1st query: tenants lookup. 2nd: stripe_customers lookup.
  platformQueryMock.mockImplementation(async (sql) => {
    if (String(sql).includes("FROM tenants")) return [{ id: "t1", org_id: "org-a" }];
    if (String(sql).includes("stripe_customers")) return [{ stripe_customer_id: "cus_1" }];
    return [];
  });
});

const portal = (returnUrl) =>
  request(app)
    .post("/api/billing/customer-portal")
    .send({ organizationId: "org-a", returnUrl });

const DEFAULT_RETURN = "https://app.br360.example.com/org/org-a/admin";

describe("#820 customer-portal returnUrl origin allowlist", () => {
  it("rejects a look-alike host that is only a string prefix match", async () => {
    const res = await portal("https://br360.example.com.attacker.com/phish");
    expect(res.status).toBe(200);
    expect(billingPortalCreateMock).toHaveBeenCalledTimes(1);
    expect(billingPortalCreateMock.mock.calls[0][0].return_url).toBe(DEFAULT_RETURN);
  });

  it("accepts the bare apex origin", async () => {
    const url = "https://br360.example.com/done";
    await portal(url);
    expect(billingPortalCreateMock.mock.calls[0][0].return_url).toBe(url);
  });

  it("accepts the configured FRONTEND_URL origin", async () => {
    const url = "https://app.br360.example.com/org/org-a/admin?upgraded=1";
    await portal(url);
    expect(billingPortalCreateMock.mock.calls[0][0].return_url).toBe(url);
  });

  it("falls back to the default for a non-URL value", async () => {
    await portal("not-a-url");
    expect(billingPortalCreateMock.mock.calls[0][0].return_url).toBe(DEFAULT_RETURN);
  });

  it("falls back to the default for a foreign origin", async () => {
    await portal("https://evil.example.com/br360.example.com");
    expect(billingPortalCreateMock.mock.calls[0][0].return_url).toBe(DEFAULT_RETURN);
  });

  it("rejects a scheme downgrade to the allowed host", async () => {
    await portal("http://br360.example.com/x");
    expect(billingPortalCreateMock.mock.calls[0][0].return_url).toBe(DEFAULT_RETURN);
  });
});
