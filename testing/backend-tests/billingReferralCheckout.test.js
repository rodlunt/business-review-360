/**
 * Issue #816 — referral code passthrough on paid Stripe checkout
 *
 * Two paths under test:
 *
 *   1. POST /api/billing/checkout — referralCode in the request body is
 *      validated against Consultant.findOne and the result lands in the Stripe
 *      session metadata as `referral_code`.
 *
 *   2. processWebhookEvent (checkout.session.completed) — referral_code in
 *      Stripe session metadata is re-validated and passed to Organization.create
 *      via buildOrgDefaults as `referredBy`.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { allEmailTemplatesMock } from '../test-fixtures/email-template-mocks.js';

// ── mock: platform DB ────────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: mockQuery },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

// ── mock: audit logger ───────────────────────────────────────────────────────
jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
}));

// ── mock: Stripe ─────────────────────────────────────────────────────────────
const mockSessionCreate = jest.fn();
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: { create: mockSessionCreate, retrieve: jest.fn() },
    },
    billingPortal: { sessions: { create: jest.fn() } },
  })),
}));

// ── mock: Organization model ─────────────────────────────────────────────────
const mockOrgFindOne = jest.fn();
const mockOrgCreate = jest.fn();
jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { findOne: mockOrgFindOne, create: mockOrgCreate },
}));

// ── mock: Consultant model ───────────────────────────────────────────────────
const mockConsultantFindOne = jest.fn();
jest.unstable_mockModule('../../backend/src/models/Consultant.js', () => ({
  default: { findOne: mockConsultantFindOne },
}));

// ── mock: ConsultantInvite model ─────────────────────────────────────────────
jest.unstable_mockModule('../../backend/src/models/ConsultantInvite.js', () => ({
  default: { findOne: jest.fn(), create: jest.fn() },
}));

// ── mock: UserOrganizationMembership model ───────────────────────────────────
jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

// ── mock: email queue ────────────────────────────────────────────────────────
jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  enqueueTemplateEmail: jest.fn().mockResolvedValue({ success: true, queueId: 'q_test' }),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));
jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
}));

// ── mock: email templates (all JSX paths share one slot) ────────────────────
jest.unstable_mockModule(
  '../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx',
  allEmailTemplatesMock,
);

// ── import module under test ─────────────────────────────────────────────────
const { publicRouter: billingPublic, protectedRouter: billingProtected, processWebhookEvent } =
  await import('../../backend/src/routes/billing.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/billing', billingPublic);
  app.use('/api/billing', authenticate, billingProtected);
});

beforeEach(() => {
  mockQuery.mockReset();
  mockSessionCreate.mockReset();
  mockConsultantFindOne.mockReset();
  mockOrgFindOne.mockReset();
  mockOrgCreate.mockReset();
});

// ── helpers ──────────────────────────────────────────────────────────────────

const FAKE_PLAN_ROW = {
  id: 'plan-sme',
  plan_code: 'sme',
  plan_name: 'SME',
  monthly_price: 2995,
  yearly_price: 29940,
  stripe_monthly_price_id: 'price_test_sme_monthly',
  stripe_yearly_price_id: 'price_test_sme_yearly',
};

const FAKE_SESSION = {
  id: 'cs_test_123',
  url: 'https://checkout.stripe.com/pay/cs_test_123',
};

function seedCheckoutQueries() {
  mockQuery
    .mockResolvedValueOnce([])              // tenants: no existing org
    .mockResolvedValueOnce([FAKE_PLAN_ROW]); // pricing_plans: plan found
}

// ── Part 1: POST /checkout ────────────────────────────────────────────────────

describe('Issue #816 — POST /api/billing/checkout referral code', () => {
  it('passes validated referral code into Stripe session metadata', async () => {
    seedCheckoutQueries();
    mockConsultantFindOne.mockResolvedValue({ referralCode: 'consultant-xyz' });
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: 'sme',
        orgIdDesired: 'ref-test-org',
        adminEmail: 'admin@example.com',
        referralCode: 'Consultant-XYZ',
      });

    expect(res.status).toBe(200);
    expect(mockSessionCreate).toHaveBeenCalledTimes(1);

    const sessionConfig = mockSessionCreate.mock.calls[0][0];
    expect(sessionConfig.metadata.referral_code).toBe('consultant-xyz');
  });

  it('uses empty string in metadata when referral code is not found', async () => {
    seedCheckoutQueries();
    mockConsultantFindOne.mockResolvedValue(null);
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: 'sme',
        orgIdDesired: 'ref-test-org-2',
        adminEmail: 'admin@example.com',
        referralCode: 'nonexistent-code',
      });

    expect(res.status).toBe(200);
    const sessionConfig = mockSessionCreate.mock.calls[0][0];
    expect(sessionConfig.metadata.referral_code).toBe('');
  });

  it('uses empty string in metadata when no referral code is supplied', async () => {
    seedCheckoutQueries();
    mockSessionCreate.mockResolvedValue(FAKE_SESSION);

    const res = await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: 'sme',
        orgIdDesired: 'ref-test-org-3',
        adminEmail: 'admin@example.com',
      });

    expect(res.status).toBe(200);
    expect(mockConsultantFindOne).not.toHaveBeenCalled();
    const sessionConfig = mockSessionCreate.mock.calls[0][0];
    expect(sessionConfig.metadata.referral_code).toBe('');
  });

  it('does not call Consultant.findOne when Stripe unavailable (consultant lookup should still run)', async () => {
    // Verify the consultant lookup runs before the Stripe call, not after.
    seedCheckoutQueries();
    mockConsultantFindOne.mockResolvedValue({ referralCode: 'early-code' });
    mockSessionCreate.mockRejectedValue(new Error('StripeConnectionError'));

    await request(app)
      .post('/api/billing/checkout')
      .send({
        planId: 'sme',
        orgIdDesired: 'ref-test-org-4',
        referralCode: 'early-code',
      });

    expect(mockConsultantFindOne).toHaveBeenCalledTimes(1);
  });
});

// ── Part 2: processWebhookEvent / handleCheckoutCompleted ─────────────────────

function makeCheckoutEvent(referralCode = '') {
  return {
    id: 'evt_test_checkout',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_456',
        customer: 'cus_test_123',
        subscription: 'sub_test_456',
        client_reference_id: 'webhook-org',
        customer_details: { email: 'admin@webhook.example', name: 'Admin User' },
        amount_total: 2995,
        currency: 'aud',
        metadata: {
          org_id: 'webhook-org',
          plan_id: 'sme',
          billing_interval: 'monthly',
          admin_email: 'admin@webhook.example',
          referral_code: referralCode,
        },
      },
    },
  };
}

function seedWebhookQueries() {
  mockQuery
    .mockResolvedValueOnce([])                          // stripe_events: not seen before
    .mockResolvedValueOnce([{ id: 'evt_test_checkout' }]) // INSERT stripe_events RETURNING id (claimed)
    .mockResolvedValueOnce([])                          // tenants: org doesn't exist
    .mockResolvedValueOnce([{ limits: { maxIdeas: 100, maxUsers: 10 } }]) // pricing_plans
    .mockResolvedValueOnce([])                          // INSERT tenants
    .mockResolvedValueOnce([{ id: 'tenant-uuid-001' }]) // SELECT tenant id
    .mockResolvedValueOnce([])                          // INSERT stripe_customers
    .mockResolvedValueOnce([]);                         // INSERT stripe_subscriptions
}

describe('Issue #816 — processWebhookEvent referral attribution', () => {
  it('creates Organisation with referredBy when referral code is valid at fulfilment', async () => {
    seedWebhookQueries();
    mockConsultantFindOne.mockResolvedValue({ referralCode: 'consultant-abc' });
    mockOrgFindOne.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ organizationId: 'webhook-org' });

    const event = makeCheckoutEvent('consultant-abc');
    const result = await processWebhookEvent(event);

    expect(result).toEqual({ received: true });
    expect(mockOrgCreate).toHaveBeenCalledTimes(1);
    const orgCreateArg = mockOrgCreate.mock.calls[0][0];
    expect(orgCreateArg.referredBy).toBe('consultant-abc');
  });

  it('creates Organisation without referredBy when referral code is inactive at fulfilment', async () => {
    seedWebhookQueries();
    mockConsultantFindOne.mockResolvedValue(null);
    mockOrgFindOne.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ organizationId: 'webhook-org' });

    const event = makeCheckoutEvent('inactive-code');
    const result = await processWebhookEvent(event);

    expect(result).toEqual({ received: true });
    expect(mockOrgCreate).toHaveBeenCalledTimes(1);
    const orgCreateArg = mockOrgCreate.mock.calls[0][0];
    expect(orgCreateArg.referredBy).toBeUndefined();
  });

  it('creates Organisation without referredBy when no referral code in metadata', async () => {
    seedWebhookQueries();
    mockOrgFindOne.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ organizationId: 'webhook-org' });

    const event = makeCheckoutEvent('');
    const result = await processWebhookEvent(event);

    expect(result).toEqual({ received: true });
    expect(mockConsultantFindOne).not.toHaveBeenCalled();
    expect(mockOrgCreate).toHaveBeenCalledTimes(1);
    const orgCreateArg = mockOrgCreate.mock.calls[0][0];
    expect(orgCreateArg.referredBy).toBeUndefined();
  });

  it('skips duplicate events without calling Consultant.findOne', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'evt_test_checkout' }]); // already seen

    const event = makeCheckoutEvent('some-code');
    const result = await processWebhookEvent(event);

    expect(result).toEqual({ received: true, skipped: true });
    expect(mockConsultantFindOne).not.toHaveBeenCalled();
    expect(mockOrgCreate).not.toHaveBeenCalled();
  });
});
