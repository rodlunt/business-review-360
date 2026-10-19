/**
 * Issue #605 -- /signup combobox plan-list drift
 *
 * Locks the contract between the signup picker's plan codes and the backend
 * whitelist at backend/src/routes/billing.js line 102. The dropdown sends the
 * plan_code of the user's choice; the route accepts only codes that resolve to
 * an active row in pricing_plans. Currently the dropdown sends "starter" and
 * "professional" (legacy literals), both rejected as INVALID_PLAN_ID.
 *
 * After this test lands, expanding the whitelist or renaming a plan_code will
 * show up here as a red test before it ships.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { allEmailTemplatesMock } from '../test-fixtures/email-template-mocks.js';

// Mock platformSequelize before importing the route. The route uses two
// queries: first to check the tenants table, then to look up the requested
// plan_code in pricing_plans. mockResolvedValueOnce drives the sequence.
const mockQuery = jest.fn();
jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: mockQuery },
}));

// auditLogger writes to audit_logs at request time. With no DB connection the
// middleware would hang or error; substitute a no-op factory.
jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
}));

// Stripe constructor runs at billing.js import time and validates the secret
// key. Mock the package so `new Stripe(...)` returns a stub regardless of env.
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: jest.fn() } },
  })),
}));

// Organization model is imported by the route but not used on the whitelist
// path; stub out the import to avoid pulling the full Sequelize init chain.
jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: {},
}));

// #738: billing.js routes transactional sends through the queue. Stubbing
// emailQueueService keeps tests hermetic (no EmailQueue.create on the test
// DB, no real renderEmail). sendTemplateEmail is no longer reachable from
// billing.js but kept as a defensive stub for any future indirect import.
jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  enqueueTemplateEmail: jest.fn().mockResolvedValue({ success: true, queueId: 'queue_test' }),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));
jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: jest.fn(),
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
  mockQuery.mockReset();
});

const validPlanRow = (planCode) => ({
  id: `row-${planCode}`,
  plan_code: planCode,
  plan_name: planCode.toUpperCase(),
  monthly_price: 2995,
  yearly_price: 29940,
  // Containing "placeholder" steers the route into STRIPE_NOT_CONFIGURED, so
  // the test never touches the Stripe stub. The whitelist gate has already
  // accepted the planId by that point, which is the contract under test.
  stripe_monthly_price_id: `placeholder_${planCode}_monthly`,
  stripe_yearly_price_id: `placeholder_${planCode}_yearly`,
});

const postCheckout = (planId) =>
  request(app)
    .post('/api/billing/checkout')
    .send({ planId, orgIdDesired: 'fixture-org' });

describe('Issue #605 -- POST /api/billing/checkout plan whitelist', () => {
  describe('accepts the plan_codes the dropdown sends', () => {
    it.each(['sme', 'pro', 'enterprise'])(
      'lets %s through the INVALID_PLAN_ID gate',
      async (planCode) => {
        mockQuery
          .mockResolvedValueOnce([]) // tenants check: no clash
          .mockResolvedValueOnce([validPlanRow(planCode)]); // pricing_plans hit

        const response = await postCheckout(planCode);

        // Whitelist passed; STRIPE_NOT_CONFIGURED is the next failure mode
        // (price IDs contain "placeholder"), which proves the gate accepted.
        expect(response.status).toBe(500);
        expect(response.body.code).toBe('STRIPE_NOT_CONFIGURED');
      },
    );
  });

  describe('rejects the legacy literals the broken dropdown still sends', () => {
    it.each(['starter', 'professional'])(
      'returns INVALID_PLAN_ID for %s',
      async (planCode) => {
        mockQuery
          .mockResolvedValueOnce([]) // tenants check: no clash
          .mockResolvedValueOnce([]); // pricing_plans miss → whitelist rejects

        const response = await postCheckout(planCode);

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('INVALID_PLAN_ID');
        expect(response.body.availablePlans).toEqual(['sme', 'pro', 'enterprise']);
      },
    );
  });
});
