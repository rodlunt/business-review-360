/**
 * Issue #932 -- checkout webhook must be retryable, not silently half-done.
 *
 * Pre-fix behaviour under test (all three tests fail against it):
 *   - an Organization.create failure was caught and swallowed ("Don't throw -
 *     tenant was created"), so the event stayed claimed as processed and
 *     Stripe never retried: a paying customer kept a tenant with no
 *     Organization and /org/{orgId} broken, with only a log line as evidence;
 *   - the tenant-exists check early-returned the whole handler, so even a
 *     retry that did arrive could not repair the missing later steps;
 *   - a missing pricing plan logged and returned quietly, marking the event
 *     processed while provisioning nothing.
 *
 * Post-fix: idempotency is per-step, failures rethrow so processWebhookEvent
 * unclaims the event (DELETE FROM stripe_events) and Stripe's retry re-runs
 * the handler end to end.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { allEmailTemplatesMock } from "../test-fixtures/email-template-mocks.js";

// ── mock: platform DB ────────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.unstable_mockModule("../../backend/src/models/platformDatabase.js", () => ({
  platformSequelize: { query: mockQuery },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

// ── mock: ntfy (the #966 conflict path must alert) ──────────────────────────
const notifyError = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule("../../backend/src/utils/ntfy.js", () => ({
  notifyError,
  notifyEvent: jest.fn().mockResolvedValue(undefined),
}));

// ── mock: audit logger ───────────────────────────────────────────────────────
jest.unstable_mockModule("../../backend/src/middleware/auditLog.js", () => ({
  auditLogger: () => (_req, _res, next) => next(),
}));

// ── mock: Stripe ─────────────────────────────────────────────────────────────
jest.unstable_mockModule("stripe", () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
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
jest.unstable_mockModule("../../backend/src/models/Consultant.js", () => ({
  default: { findOne: jest.fn().mockResolvedValue(null) },
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
const enqueueTemplateEmail = jest.fn().mockResolvedValue({ success: true, queueId: "q_test" });
jest.unstable_mockModule("../../backend/src/services/emailQueueService.js", () => ({
  enqueueTemplateEmail,
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));
jest.unstable_mockModule("../../backend/src/emails/utils/sendEmail.js", () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
}));

// ── mock: email templates (all JSX paths share one slot) ────────────────────
jest.unstable_mockModule(
  "../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx",
  allEmailTemplatesMock
);

// ── import module under test ─────────────────────────────────────────────────
const { processWebhookEvent } = await import("../../backend/src/routes/billing.js");

beforeEach(() => {
  mockQuery.mockReset();
  mockOrgFindOne.mockReset();
  mockOrgCreate.mockReset();
  enqueueTemplateEmail.mockClear();
  notifyError.mockClear();
});

function makeCheckoutEvent() {
  return {
    id: "evt_retry_test",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_retry_456",
        customer: "cus_retry_123",
        subscription: "sub_retry_456",
        client_reference_id: "retry-org",
        customer_details: { email: "admin@retry.example", name: "Admin User" },
        amount_total: 2995,
        currency: "aud",
        metadata: {
          org_id: "retry-org",
          plan_id: "sme",
          billing_interval: "monthly",
          admin_email: "admin@retry.example",
          referral_code: "",
        },
      },
    },
  };
}

const CLAIM = [{ id: "evt_retry_test" }];
const PLAN = [{ limits: { maxIdeas: 100, maxUsers: 10 } }];
const TENANT_ROW = [{ id: "tenant-uuid-001" }];

function deleteCalls() {
  return mockQuery.mock.calls.filter(([sql]) => /DELETE FROM stripe_events/i.test(sql));
}

describe("Issue #932 -- checkout webhook retry semantics", () => {
  it("rethrows an Organization.create failure and unclaims the event for retry", async () => {
    mockQuery
      .mockResolvedValueOnce([]) // stripe_events: not seen
      .mockResolvedValueOnce(CLAIM) // claim insert
      .mockResolvedValueOnce([]) // tenants: none
      .mockResolvedValueOnce(PLAN) // pricing_plans
      .mockResolvedValueOnce([]) // INSERT tenants
      .mockResolvedValueOnce(TENANT_ROW) // SELECT tenant id
      .mockResolvedValueOnce([]) // INSERT stripe_customers
      .mockResolvedValueOnce([]) // INSERT stripe_subscriptions
      .mockResolvedValueOnce([]); // DELETE stripe_events (unclaim)
    mockOrgFindOne.mockResolvedValue(null);
    mockOrgCreate.mockRejectedValue(new Error("app db unreachable"));

    await expect(processWebhookEvent(makeCheckoutEvent())).rejects.toThrow("app db unreachable");

    expect(deleteCalls()).toHaveLength(1);
    // Nothing announced success on the broken path.
    expect(enqueueTemplateEmail).not.toHaveBeenCalled();
  });

  it("repairs a half-provisioned tenant on retry: existing tenant, missing Organization", async () => {
    mockQuery
      .mockResolvedValueOnce([]) // stripe_events: not seen (prior claim was removed)
      .mockResolvedValueOnce(CLAIM) // claim insert
      .mockResolvedValueOnce(TENANT_ROW) // tenants: already exists
      .mockResolvedValueOnce([{ stripe_customer_id: "cus_retry_123" }]) // #966 owner check: same customer
      .mockResolvedValueOnce(TENANT_ROW) // SELECT tenant id
      .mockResolvedValueOnce([]) // INSERT stripe_customers (ON CONFLICT no-op)
      .mockResolvedValueOnce([]); // INSERT stripe_subscriptions (ON CONFLICT no-op)
    mockOrgFindOne.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ organizationId: "retry-org" });

    const result = await processWebhookEvent(makeCheckoutEvent());

    expect(result).toEqual({ received: true });
    // The retry reached and completed the Organization step instead of
    // early-returning at the tenant-exists check.
    expect(mockOrgCreate).toHaveBeenCalledTimes(1);
    // And it did not re-run the plan lookup or tenant insert.
    const sqls = mockQuery.mock.calls.map(([sql]) => sql);
    expect(sqls.some((sql) => /pricing_plans/i.test(sql))).toBe(false);
    expect(sqls.some((sql) => /INSERT INTO tenants/i.test(sql))).toBe(false);
  });

  it("#966: a paid session for a slug owned by another customer provisions nothing and alerts", async () => {
    mockQuery
      .mockResolvedValueOnce([]) // stripe_events: not seen
      .mockResolvedValueOnce(CLAIM) // claim insert
      .mockResolvedValueOnce(TENANT_ROW) // tenants: already exists
      .mockResolvedValueOnce([{ stripe_customer_id: "cus_someone_else" }]); // #966 owner check: DIFFERENT customer

    const result = await processWebhookEvent(makeCheckoutEvent());

    // Event completes as processed (a retry can never win the race) with no
    // provisioning side effects for the losing customer.
    expect(result).toEqual({ received: true });
    expect(mockOrgCreate).not.toHaveBeenCalled();
    expect(enqueueTemplateEmail).not.toHaveBeenCalled();
    const sqls = mockQuery.mock.calls.map(([sql]) => sql);
    expect(sqls.some((sql) => /INSERT INTO stripe_subscriptions/i.test(sql))).toBe(false);
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError.mock.calls[0][0]).toMatch(/conflict/i);
  });

  it("#966: an existing tenant with no recorded customer proceeds (manual-SQL tenants keep working)", async () => {
    mockQuery
      .mockResolvedValueOnce([]) // stripe_events: not seen
      .mockResolvedValueOnce(CLAIM) // claim insert
      .mockResolvedValueOnce(TENANT_ROW) // tenants: already exists
      .mockResolvedValueOnce([]) // #966 owner check: no customer rows
      .mockResolvedValueOnce(TENANT_ROW) // SELECT tenant id
      .mockResolvedValueOnce([]) // INSERT stripe_customers
      .mockResolvedValueOnce([]); // INSERT stripe_subscriptions
    mockOrgFindOne.mockResolvedValue({ organizationId: "retry-org" });

    const result = await processWebhookEvent(makeCheckoutEvent());

    expect(result).toEqual({ received: true });
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("throws on a missing pricing plan instead of marking the event processed", async () => {
    mockQuery
      .mockResolvedValueOnce([]) // stripe_events: not seen
      .mockResolvedValueOnce(CLAIM) // claim insert
      .mockResolvedValueOnce([]) // tenants: none
      .mockResolvedValueOnce([]) // pricing_plans: MISSING
      .mockResolvedValueOnce([]); // DELETE stripe_events (unclaim)

    await expect(processWebhookEvent(makeCheckoutEvent())).rejects.toThrow(/Plan sme not found/);

    expect(deleteCalls()).toHaveLength(1);
    expect(mockOrgCreate).not.toHaveBeenCalled();
  });
});
