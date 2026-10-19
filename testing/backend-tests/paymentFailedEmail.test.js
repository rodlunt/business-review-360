/**
 * Issue #585 -- payment-failure email notification + idempotency.
 *
 * Verifies the new email branch added to handlePaymentFailed in
 * backend/src/routes/billing.js:
 *
 *   1. Email IS dispatched on the first invoice.payment_failed event
 *      (attempt_count === 1) for a given invoice.
 *   2. Email is NOT dispatched on subsequent retries for the same invoice
 *      (attempt_count > 1). Stripe retries the invoice automatically per
 *      the dashboard retry schedule and the email would otherwise fire
 *      once per retry, spamming the customer.
 *   3. Tenant suspension still happens regardless of email outcome
 *      (idempotent UPDATE runs on every webhook).
 *   4. Email errors do not crash the webhook -- the exception is caught
 *      and logged inside handlePaymentFailed.
 *
 * Mocks via jest.unstable_mockModule are MANDATORY here:
 *   - billing.js calls `new Stripe(process.env.STRIPE_SECRET_KEY)` at
 *     import time, and backend tests inherit prod .env (#593). Without the
 *     mock, tests would hit live Stripe.
 *   - The platform DB is mocked so we do not need a real Postgres.
 *   - enqueueTemplateEmail is mocked so no real EmailQueue.create or render
 *     happens (#738 routed billing transactional sends through the queue).
 *   - The PaymentFailed.jsx template is stubbed because Jest's default ESM
 *     transform does not handle JSX. Pattern adopted from
 *     billingSessionAuth.test.js (#535).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// --- mocks must be registered BEFORE the router is imported -----------------

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: jest.fn(), create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  })),
}));

const platformQueryMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: platformQueryMock },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => next(),
  requireSameOrganization: (req, res, next) => next(),
  generateToken: jest.fn(),
  createSession: jest.fn().mockResolvedValue({}),
  generateDemoToken: jest.fn().mockReturnValue({ token: 'demo-tok', user: { isDemo: true } }),
  requireAdmin: (req, res, next) => next(),
  ACCESS_TOKEN_TTL_MS: 900000,
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { findOne: jest.fn(), create: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/models/Consultant.js', () => ({
  default: { findOne: jest.fn().mockResolvedValue(null) },
}));

jest.unstable_mockModule('../../backend/src/models/ConsultantInvite.js', () => ({
  default: { findOne: jest.fn().mockResolvedValue(null) },
}));

jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: { create: jest.fn().mockResolvedValue({}) },
}));

// #738: billing.js now routes through enqueueTemplateEmail (queue-backed
// transactional sends) instead of sendTemplateEmail. The mocked EmailPriority
// values mirror backend/src/services/emailQueueService.js so callers that
// reference EmailPriority.HIGH still resolve.
const enqueueTemplateEmailMock = jest.fn();
jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  enqueueTemplateEmail: enqueueTemplateEmailMock,
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));

// React Email templates are JSX; backend/jest moduleNameMapper rewrites
// `\.jsx$` -> react/jsx-runtime so JSX is never parsed by the transform.
// Both template imports therefore resolve to the SAME final module id, so we
// must register a single mock that provides BOTH named exports rather than
// two separate calls -- the second call would otherwise overwrite the first
// and leave one of the named exports undefined at billing.js evaluation time.
jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({}),
  buildFromHeader: jest.fn(),
}));

jest.unstable_mockModule(
  '../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx',
  () => ({
    DemoLeadCapture: () => null,
    SubscriptionCancelled: () => null,
    PaymentFailed: () => null,
    SignupWelcome: () => null,
    TrialWelcome: () => null,
    ConsultantAccessGrantedEmail: () => null,
    ConsultantAccessDeclinedEmail: () => null,
    ConsultantMonthlyStatementEmail: () => null,
  }),
);
jest.unstable_mockModule(
  '../../backend/src/emails/templates/notifications/PaymentFailed.jsx',
  () => ({
    DemoLeadCapture: () => null,
    SubscriptionCancelled: () => null,
    PaymentFailed: () => null,
    SignupWelcome: () => null,
    TrialWelcome: () => null,
    ConsultantAccessGrantedEmail: () => null,
    ConsultantAccessDeclinedEmail: () => null,
    ConsultantMonthlyStatementEmail: () => null,
  }),
);

const { processWebhookEvent } = await import('../../backend/src/routes/billing.js');

// --- helpers ----------------------------------------------------------------

/**
 * Build a synthetic Stripe invoice.payment_failed webhook event.
 * `id` differs per attempt (Stripe assigns a new event id each retry) but
 * `data.object.id` (the invoice id) stays constant for the same invoice.
 */
function buildPaymentFailedEvent({ eventId, invoiceId, subscriptionId, attemptCount }) {
  return {
    id: eventId,
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: invoiceId,
        subscription: subscriptionId,
        attempt_count: attemptCount,
        next_payment_attempt: 1735689600, // 2025-01-01T00:00:00Z
      },
    },
  };
}

/**
 * Configure platformSequelize.query to behave realistically:
 *   - The stripe_events idempotency SELECT returns `[]` (no prior event).
 *   - The stripe_events INSERT returns ok.
 *   - The tenant suspension UPDATE returns ok.
 *   - The customer-row SELECT (joins stripe_subscriptions + stripe_customers)
 *     returns the row provided.
 */
function setQueryBehaviour({ customerRow }) {
  platformQueryMock.mockReset();
  platformQueryMock.mockImplementation((sql) => {
    const text = String(sql).toLowerCase();

    if (text.includes('from stripe_events')) {
      return Promise.resolve([]); // event has not been processed before
    }
    if (text.includes('insert into stripe_events')) {
      // RETURNING id: non-empty array means the row was inserted (not a conflict).
      return Promise.resolve([{ id: 'evt_test_id' }]);
    }
    if (text.includes('update tenants')) {
      return Promise.resolve([undefined, 1]); // [results, rowCount]
    }
    if (text.includes('from stripe_subscriptions ss')) {
      return Promise.resolve(customerRow ? [customerRow] : []);
    }
    return Promise.resolve([]);
  });
}

// --- tests ------------------------------------------------------------------

describe('Issue #585 -- handlePaymentFailed email + idempotency', () => {
  beforeEach(() => {
    enqueueTemplateEmailMock.mockReset();
    enqueueTemplateEmailMock.mockResolvedValue({ success: true, queueId: 'queue_test' });
  });

  it('dispatches the PaymentFailed email on the first attempt (attempt_count === 1)', async () => {
    setQueryBehaviour({
      customerRow: {
        customer_email: 'owner@example-customer.au',
        customer_name: 'Pat Owner',
        plan_name: 'SME Monthly',
        organization_id: 'demo-corp',
      },
    });

    const event = buildPaymentFailedEvent({
      eventId: 'evt_attempt_1',
      invoiceId: 'in_test_xyz',
      subscriptionId: 'sub_test_xyz',
      attemptCount: 1,
    });

    const result = await processWebhookEvent(event);

    expect(result).toEqual({ received: true });
    expect(enqueueTemplateEmailMock).toHaveBeenCalledTimes(1);

    const args = enqueueTemplateEmailMock.mock.calls[0][0];
    expect(args.to).toBe('owner@example-customer.au');
    expect(args.subject).toBe('Action required: your payment failed');
    expect(args.categories).toEqual(['billing', 'payment-failed']);
    expect(args.templateProps.customerName).toBe('Pat Owner');
    expect(args.templateProps.planName).toBe('SME Monthly');
    expect(args.templateProps.retryDate).toBe('2025-01-01T00:00:00.000Z');
    // #738 + reviewer follow-up: assert tenant attribution survives the
    // SQL -> enqueue path. Regression test for ss.org_id silently nulling.
    expect(args.organizationId).toBe('demo-corp');
    expect(args.type).toBe('payment-failed');

    // Tenant suspension still ran.
    const suspensionCalled = platformQueryMock.mock.calls.some(([sql]) =>
      String(sql).toLowerCase().includes('update tenants'),
    );
    expect(suspensionCalled).toBe(true);
  });

  it('does NOT dispatch email on subsequent retry attempts (attempt_count > 1)', async () => {
    setQueryBehaviour({
      customerRow: {
        customer_email: 'owner@example-customer.au',
        customer_name: 'Pat Owner',
        plan_name: 'SME Monthly',
      },
    });

    const event = buildPaymentFailedEvent({
      eventId: 'evt_attempt_2',
      invoiceId: 'in_test_xyz',
      subscriptionId: 'sub_test_xyz',
      attemptCount: 2, // Stripe retry -- email must not fire again
    });

    const result = await processWebhookEvent(event);

    expect(result).toEqual({ received: true });
    expect(enqueueTemplateEmailMock).not.toHaveBeenCalled();

    // Tenant suspension still runs even on retries (idempotent).
    const suspensionCalled = platformQueryMock.mock.calls.some(([sql]) =>
      String(sql).toLowerCase().includes('update tenants'),
    );
    expect(suspensionCalled).toBe(true);
  });

  it('still suspends the tenant when no customer email is on file (no email sent)', async () => {
    setQueryBehaviour({ customerRow: null });

    const event = buildPaymentFailedEvent({
      eventId: 'evt_no_email',
      invoiceId: 'in_no_email',
      subscriptionId: 'sub_no_email',
      attemptCount: 1,
    });

    const result = await processWebhookEvent(event);

    expect(result).toEqual({ received: true });
    expect(enqueueTemplateEmailMock).not.toHaveBeenCalled();

    const suspensionCalled = platformQueryMock.mock.calls.some(([sql]) =>
      String(sql).toLowerCase().includes('update tenants'),
    );
    expect(suspensionCalled).toBe(true);
  });

  it('does not crash the webhook when the email layer throws', async () => {
    setQueryBehaviour({
      customerRow: {
        customer_email: 'owner@example-customer.au',
        customer_name: null,
        plan_name: 'Pro',
      },
    });

    enqueueTemplateEmailMock.mockRejectedValueOnce(new Error('Resend exploded'));

    const event = buildPaymentFailedEvent({
      eventId: 'evt_email_throws',
      invoiceId: 'in_email_throws',
      subscriptionId: 'sub_email_throws',
      attemptCount: 1,
    });

    // The whole webhook must still resolve cleanly.
    const result = await processWebhookEvent(event);
    expect(result).toEqual({ received: true });
    expect(enqueueTemplateEmailMock).toHaveBeenCalledTimes(1);

    const suspensionCalled = platformQueryMock.mock.calls.some(([sql]) =>
      String(sql).toLowerCase().includes('update tenants'),
    );
    expect(suspensionCalled).toBe(true);
  });

  it('does not crash the webhook when the email helper returns success:false', async () => {
    setQueryBehaviour({
      customerRow: {
        customer_email: 'owner@example-customer.au',
        customer_name: null,
        plan_name: 'Pro',
      },
    });

    enqueueTemplateEmailMock.mockResolvedValueOnce({
      success: false,
      error: 'No email provider configured',
    });

    const event = buildPaymentFailedEvent({
      eventId: 'evt_email_fails',
      invoiceId: 'in_email_fails',
      subscriptionId: 'sub_email_fails',
      attemptCount: 1,
    });

    const result = await processWebhookEvent(event);
    expect(result).toEqual({ received: true });
    expect(enqueueTemplateEmailMock).toHaveBeenCalledTimes(1);
  });
});
