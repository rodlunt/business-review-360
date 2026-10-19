/**
 * Issues #709 + #710 -- billing endpoint hardening.
 *
 * #709: POST /api/billing/checkout is rate-limited at 5 requests per IP per
 * minute. The 6th request returns 429 with a Retry-After header.
 *
 * #710: GET /api/billing/plans returns Cache-Control headers so anonymous
 * callers and CDNs can cache the public plan list.
 *
 * Mock strategy mirrors testing/backend-tests/billingPlanWhitelist.test.js:
 * stub Stripe (called at billing.js import time), the audit logger, the
 * platform DB, the Organization model, the email sender, and the React Email
 * templates. Tests exercise only the new middleware behaviour.
 *
 * Note: process.env.DISABLE_RATE_LIMIT must NOT be set when this file loads
 * (jest.setup.js leaves it unset). If a future change defaults
 * DISABLE_RATE_LIMIT=true for tests, the rate-limit case below will fail loud
 * because it expects a real 429.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Make sure DISABLE_RATE_LIMIT is unset for this file. The limiter in
// billing.js inspects process.env at module-load time, so this must run
// before the dynamic import below.
delete process.env.DISABLE_RATE_LIMIT;

const mockQuery = jest.fn();
jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: mockQuery },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  })),
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

// React Email JSX templates resolve via moduleNameMapper to react/jsx-runtime,
// so each .jsx mock factory must export every name billing.js imports or the
// last factory wins. Mirrors the pattern in billingPlanWhitelist.test.js.
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

// #720: billing.js now exports publicRouter + protectedRouter.
const { publicRouter: billingPublic, protectedRouter: billingProtected } = await import('../../backend/src/routes/billing.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;

beforeAll(() => {
  app = express();
  // express-rate-limit needs a stable client identifier. With the default
  // Express setup, supertest connections come from 127.0.0.1, which is the
  // single bucket all 6 calls below share.
  app.set('trust proxy', false);
  app.use(express.json());
  app.use('/api/billing', billingPublic);
  app.use('/api/billing', authenticate, billingProtected);
});

beforeEach(() => {
  mockQuery.mockReset();
});

describe('Issue #709 -- POST /api/billing/checkout rate limiting', () => {
  it('allows 5 calls then returns 429 with Retry-After on the 6th', async () => {
    // Each accepted call needs the two query results the route expects:
    // (1) tenants check (no clash) and (2) pricing_plans lookup that returns a
    // placeholder Stripe price ID, so the route bails with STRIPE_NOT_CONFIGURED
    // (status 500) rather than calling the Stripe stub. The whitelist gate has
    // already passed by then; that is enough to confirm the limiter let the
    // call through. The 6th call should be rejected by the limiter BEFORE the
    // route handler runs, so no DB mock is consumed for it.
    for (let i = 0; i < 5; i += 1) {
      mockQuery
        .mockResolvedValueOnce([]) // tenants check
        .mockResolvedValueOnce([
          {
            id: `row-${i}`,
            plan_code: 'sme',
            plan_name: 'SME',
            monthly_price: 2995,
            yearly_price: 29940,
            stripe_monthly_price_id: 'placeholder_sme_monthly',
            stripe_yearly_price_id: 'placeholder_sme_yearly',
          },
        ]);
    }

    const payload = { planId: 'sme', orgIdDesired: 'rate-limit-org' };

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/billing/checkout').send(payload);
      // Whitelist passed; STRIPE_NOT_CONFIGURED is the next failure mode.
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('STRIPE_NOT_CONFIGURED');
    }

    // The 6th call should be rejected by the limiter.
    const blocked = await request(app)
      .post('/api/billing/checkout')
      .send(payload);

    expect(blocked.status).toBe(429);
    // express-rate-limit with standardHeaders:true emits Retry-After on 429.
    expect(blocked.headers['retry-after']).toBeDefined();
    // Optional but useful sanity check: standardHeaders also exposes
    // RateLimit-* informational headers.
    expect(blocked.headers['ratelimit-limit']).toBeDefined();
    // The handler MUST NOT have been invoked, so no extra DB call was issued.
    // 5 accepted requests * 2 queries = 10 mock calls, no more.
    expect(mockQuery).toHaveBeenCalledTimes(10);
  });
});

describe('Issue #710 -- GET /api/billing/plans cache headers', () => {
  it('returns Cache-Control: public, max-age=300, s-maxage=600 on success', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        plan_code: 'sme',
        plan_name: 'SME',
        description: 'Small business tier',
        monthly_price: 2995,
        yearly_price: 29940,
        currency: 'aud',
        limits: {},
        features: [],
        is_public: true,
      },
    ]);

    const res = await request(app).get('/api/billing/plans');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(
      'public, max-age=300, s-maxage=600',
    );
    expect(res.body.plans).toHaveLength(1);
  });
});
