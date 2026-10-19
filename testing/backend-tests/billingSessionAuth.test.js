/**
 * Issue #535 -- billing checkout-session auth + org binding.
 *
 * Mocks the stripe SDK, the authenticate middleware, and the auditLogger
 * factory so the test exercises only the new auth + metadata-binding logic.
 *
 * Mocks via jest.unstable_mockModule are MANDATORY here because:
 *   - billing.js calls `new Stripe(process.env.STRIPE_SECRET_KEY)` at import
 *     time, and backend tests inherit prod .env (#593). Without the mock,
 *     tests would hit live Stripe.
 *   - authenticate normally hits the platform DB to load a User row;
 *     mocking it lets us inject req.user without minting real JWTs or
 *     standing up the platform DB.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { allEmailTemplatesMock } from '../test-fixtures/email-template-mocks.js';

// --- mocks must be registered BEFORE the router is imported -----------------

const stripeRetrieveMock = jest.fn();
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        retrieve: stripeRetrieveMock,
        create: jest.fn(),
      },
    },
    billingPortal: { sessions: { create: jest.fn() } },
  })),
}));

let authBehaviour = { mode: 'allow', organizationId: 'org-a' };
jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (authBehaviour.mode === 'reject') {
      return res.status(401).json({ error: 'No token provided' });
    }
    req.user = { id: 1, organizationId: authBehaviour.organizationId };
    next();
  },
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

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { findOne: jest.fn(), create: jest.fn() },
}));

// #738: billing.js routes transactional sends through the queue.
jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  enqueueTemplateEmail: jest.fn().mockResolvedValue({ success: true, queueId: 'queue_test' }),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));
jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
}));

// All *.jsx paths share one module slot (moduleNameMapper); one call suffices.
// allEmailTemplatesMock exports every template name so no factory is stale
// when new templates are added. Issue #703.
jest.unstable_mockModule(
  '../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx',
  allEmailTemplatesMock,
);

// #720: billing.js now exports publicRouter + protectedRouter.
const { publicRouter: billingPublic, protectedRouter: billingProtected } = await import('../../backend/src/routes/billing.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/billing', billingPublic);
  app.use('/api/billing', authenticate, billingProtected);
});

beforeEach(() => {
  stripeRetrieveMock.mockReset();
  authBehaviour = { mode: 'allow', organizationId: 'org-a' };
});

describe('Issue #535 -- GET /api/billing/checkout-session/:sessionId', () => {
  it('case 1: unauthenticated request returns 401', async () => {
    authBehaviour = { mode: 'reject' };

    const res = await request(app).get('/api/billing/checkout-session/cs_test_unauth');

    expect(res.status).toBe(401);
    expect(res.body.customerEmail).toBeUndefined();
    expect(stripeRetrieveMock).not.toHaveBeenCalled();
  });

  it('case 2: cross-org request returns 403 SESSION_ORG_MISMATCH', async () => {
    authBehaviour = { mode: 'allow', organizationId: 'org-a' };
    stripeRetrieveMock.mockResolvedValue({
      metadata: { org_id: 'org-b', plan_id: 'pro', billing_interval: 'monthly' },
      payment_status: 'paid',
      customer_details: { email: 'b@example.com' },
    });

    const res = await request(app)
      .get('/api/billing/checkout-session/cs_test_xorg')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_ORG_MISMATCH');
    expect(res.body.customerEmail).toBeUndefined();
  });

  it('case 3: session without binding metadata returns 403 SESSION_NOT_BOUND', async () => {
    authBehaviour = { mode: 'allow', organizationId: 'org-a' };
    stripeRetrieveMock.mockResolvedValue({
      metadata: {},
      payment_status: 'paid',
      customer_details: { email: 'a@example.com' },
    });

    const res = await request(app)
      .get('/api/billing/checkout-session/cs_test_nometa')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_NOT_BOUND');
    expect(res.body.customerEmail).toBeUndefined();
  });

  it('case 4: owning user gets 200 with full payload', async () => {
    authBehaviour = { mode: 'allow', organizationId: 'org-a' };
    stripeRetrieveMock.mockResolvedValue({
      metadata: { org_id: 'org-a', plan_id: 'pro', billing_interval: 'monthly' },
      payment_status: 'paid',
      customer_details: { email: 'a@example.com' },
    });

    const res = await request(app)
      .get('/api/billing/checkout-session/cs_test_owner')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.customerEmail).toBe('a@example.com');
    expect(res.body.orgId).toBe('org-a');
    expect(res.body.plan).toBe('pro');
    expect(res.body.status).toBe('paid');
  });

  it('case 5: Stripe outage returns 500 SESSION_RETRIEVE_ERROR', async () => {
    authBehaviour = { mode: 'allow', organizationId: 'org-a' };
    stripeRetrieveMock.mockRejectedValue(new Error('stripe down'));

    const res = await request(app)
      .get('/api/billing/checkout-session/cs_test_outage')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SESSION_RETRIEVE_ERROR');
  });

  it('case 7: invalid session ID (Stripe 404) returns 404 SESSION_NOT_FOUND', async () => {
    authBehaviour = { mode: 'allow', organizationId: 'org-a' };
    const notFoundErr = Object.assign(new Error('No such checkout.session: cs_invalid'), { statusCode: 404, type: 'StripeInvalidRequestError' });
    stripeRetrieveMock.mockRejectedValue(notFoundErr);

    const res = await request(app)
      .get('/api/billing/checkout-session/cs_invalid')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
    expect(res.body.customerEmail).toBeUndefined();
  });

  it('case 6: prefix collision still returns 403 (no startsWith bypass)', async () => {
    authBehaviour = { mode: 'allow', organizationId: 'org-a' };
    stripeRetrieveMock.mockResolvedValue({
      metadata: { org_id: 'org-a-evil', plan_id: 'pro', billing_interval: 'monthly' },
      payment_status: 'paid',
      customer_details: { email: 'evil@example.com' },
    });

    const res = await request(app)
      .get('/api/billing/checkout-session/cs_test_prefix')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SESSION_ORG_MISMATCH');
  });
});
