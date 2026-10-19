/**
 * Issue #488 -- billing usage + customer-portal auth + same-org enforcement.
 *
 * Replaces the e2e tautology at testing/e2e/14-billing-purchase-flow.spec.js
 * (line 357 area) and testing/e2e/15-new-customer-onboarding.spec.js
 * (line 368 area), which only asserted the status code returned by the live
 * backend. Those assertions ran exclusively in Playwright (production-smoke),
 * never in jest, so a regression in `authenticate` order or in
 * `requireSameOrganization` would ship undetected on every PR.
 *
 * This suite covers the two billing routes the existing jest billing suites
 * miss: GET /api/billing/usage and POST /api/billing/customer-portal. The
 * other three routes are already covered: /checkout (#605), /plans (public,
 * intentionally no auth gate), /checkout-session/:sessionId (#535).
 *
 * Mocks via jest.unstable_mockModule are MANDATORY here for the same reasons
 * documented in billingSessionAuth.test.js: billing.js calls
 * `new Stripe(process.env.STRIPE_SECRET_KEY)` at import time, and backend
 * tests inherit prod .env (memory project_dotenv_test_leak.md). We mock the
 * full module list (stripe, auth, auditLog, platformDatabase, planLimits,
 * Organization, sendEmail, SubscriptionCancelled.jsx) to keep the suite
 * hermetic.
 *
 * The `requireSameOrganization` mock implements the real-shape comparison
 * (read organizationId from query/body/params, compare to req.user.organizationId,
 * 403 on mismatch). A passthrough mock would silently pass cases 2 and 5 even
 * if the real middleware were removed, which defeats the purpose of the test.
 * See risk 12.2 in the spec.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { allEmailTemplatesMock } from '../test-fixtures/email-template-mocks.js';

// --- mocks must be registered BEFORE the router is imported -----------------

const stripeBillingPortalCreateMock = jest.fn();
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        retrieve: jest.fn(),
        create: jest.fn(),
      },
    },
    billingPortal: { sessions: { create: stripeBillingPortalCreateMock } },
  })),
}));

let authBehaviour = { mode: 'allow', organizationId: 'org-a' };
jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (authBehaviour.mode === 'reject') {
      return res.status(401).json({ error: 'No token provided' });
    }
    req.user = {
      id: 1,
      username: 'fixture-user',
      organizationId: authBehaviour.organizationId,
    };
    next();
  },
  // Real-shape mock: reads organizationId from params, query, or body
  // (matching backend/src/middleware/auth.js line 116 area) and 403s on
  // mismatch with req.user.organizationId. Without this shape, cases 2 and 5
  // would silently pass even after the real gate is removed.
  requireSameOrganization: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const requested =
      (req.params && req.params.organizationId) ||
      (req.query && req.query.organizationId) ||
      (req.body && req.body.organizationId);
    if (requested && req.user.organizationId !== requested) {
      return res.status(403).json({
        error: "You do not have access to this organization's data.",
      });
    }
    next();
  },
  generateToken: jest.fn(),
  createSession: jest.fn().mockResolvedValue({}),
  generateDemoToken: jest.fn().mockReturnValue({ token: 'demo-tok', user: { isDemo: true } }),
  requireAdmin: (req, res, next) => next(),
  ACCESS_TOKEN_TTL_MS: 900000,
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (req, res, next) => next(),
}));

const platformQueryMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: platformQueryMock },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

// /usage handler does a dynamic `await import("../middleware/planLimits.js")`
// after the tenant lookup. Cases 1 and 2 short-circuit at auth/gate; case 3
// short-circuits at the 404 branch before this import is reached. The mock is
// precautionary; no case in this suite currently exercises it.
const getTenantUsageMock = jest.fn().mockResolvedValue({ ideas: 0, users: 0, storage: 0 });
jest.unstable_mockModule('../../backend/src/middleware/planLimits.js', () => ({
  getTenantUsage: getTenantUsageMock,
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
  stripeBillingPortalCreateMock.mockReset();
  platformQueryMock.mockReset();
  getTenantUsageMock.mockClear();
  authBehaviour = { mode: 'allow', organizationId: 'org-a' };
});

describe('Issue #488 -- billing auth + same-org enforcement', () => {
  describe('GET /api/billing/usage', () => {
    it('case 1: unauthenticated request returns 401', async () => {
      authBehaviour = { mode: 'reject' };

      const res = await request(app).get('/api/billing/usage');

      expect(res.status).toBe(401);
      expect(res.body.usage).toBeUndefined();
      expect(res.body.limits).toBeUndefined();
      expect(res.body.plan).toBeUndefined();
      expect(res.body.tenantName).toBeUndefined();
      // Auth must short-circuit before the handler queries the platform DB.
      expect(platformQueryMock).not.toHaveBeenCalled();
    });

    it('case 2: cross-org request returns 403', async () => {
      authBehaviour = { mode: 'allow', organizationId: 'org-a' };

      const res = await request(app)
        .get('/api/billing/usage')
        .query({ organizationId: 'org-b' })
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(403);
      expect(res.body.usage).toBeUndefined();
      expect(res.body.limits).toBeUndefined();
      // Same-org gate must short-circuit before the tenant lookup runs.
      expect(platformQueryMock).not.toHaveBeenCalled();
    });

    it('case 3: unknown organisation returns 404 ORG_NOT_FOUND', async () => {
      // This asserts the tenant-not-found 404 branch. If the handler is
      // reordered to call getTenantUsage before the tenant lookup, revisit
      // the mock setup (see spec risk 12.5).
      authBehaviour = { mode: 'allow', organizationId: 'org-a' };
      platformQueryMock.mockResolvedValueOnce([]); // tenants lookup: empty

      const res = await request(app)
        .get('/api/billing/usage')
        .query({ organizationId: 'org-a' })
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ORG_NOT_FOUND');
      expect(res.body.usage).toBeUndefined();
    });
  });

  describe('POST /api/billing/customer-portal', () => {
    it('case 4: unauthenticated request returns 401', async () => {
      authBehaviour = { mode: 'reject' };

      const res = await request(app)
        .post('/api/billing/customer-portal')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.url).toBeUndefined();
      // Auth must short-circuit before any Stripe portal call.
      expect(stripeBillingPortalCreateMock).not.toHaveBeenCalled();
      expect(platformQueryMock).not.toHaveBeenCalled();
    });

    it('case 5: cross-org request returns 403', async () => {
      authBehaviour = { mode: 'allow', organizationId: 'org-a' };

      const res = await request(app)
        .post('/api/billing/customer-portal')
        .set('Authorization', 'Bearer fake')
        .send({ organizationId: 'org-b' });

      expect(res.status).toBe(403);
      expect(res.body.url).toBeUndefined();
      // Same-org gate must short-circuit before the Stripe portal call.
      expect(stripeBillingPortalCreateMock).not.toHaveBeenCalled();
      expect(platformQueryMock).not.toHaveBeenCalled();
    });

    it('case 6: no Stripe customer returns 404 NO_SUBSCRIPTION', async () => {
      authBehaviour = { mode: 'allow', organizationId: 'org-a' };
      platformQueryMock
        // tenants lookup: caller's org exists
        .mockResolvedValueOnce([{ id: 't1', org_id: 'org-a' }])
        // stripe_customers lookup: no row (subscription not provisioned)
        .mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/billing/customer-portal')
        .set('Authorization', 'Bearer fake')
        .send({ organizationId: 'org-a' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NO_SUBSCRIPTION');
      expect(res.body.url).toBeUndefined();
      // Handler short-circuits before any Stripe portal call.
      expect(stripeBillingPortalCreateMock).not.toHaveBeenCalled();
    });
  });
});
