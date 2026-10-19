/**
 * Issue #566 -- POST /api/billing/demo-access and POST /api/billing/demo-switch-role.
 *
 * Covers:
 *   - reCAPTCHA gate (missing, failed, unconfigured, upstream error, valid)
 *   - demo-access: JWT response shape with and without visitor email
 *   - demo-access: lead capture email enqueued when email + LEAD_CAPTURE_EMAIL set
 *   - demo-access: no lead email when email omitted or LEAD_CAPTURE_EMAIL unset
 *   - demo-switch-role: rejects non-demo users
 *   - demo-switch-role: swaps role in returned JWT
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// --- mocks must be registered BEFORE billing.js is imported -----------------

const verifyRecaptchaMock = jest.fn();
jest.unstable_mockModule('../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptcha: verifyRecaptchaMock,
}));

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
  })),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { findOne: jest.fn(), create: jest.fn().mockResolvedValue({}) },
}));

jest.unstable_mockModule('../../backend/src/models/User.js', () => ({
  default: { create: jest.fn().mockResolvedValue({ id: 'u1', username: 'admin', email: 'a@b.com', organizationId: 'x' }) },
}));

const enqueueTemplateEmailMock = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  enqueueTemplateEmail: enqueueTemplateEmailMock,
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));

// All *.jsx paths share one module slot via moduleNameMapper.
jest.unstable_mockModule('../../backend/src/models/Consultant.js', () => ({
  default: { findOne: jest.fn().mockResolvedValue(null) },
}));

jest.unstable_mockModule('../../backend/src/models/ConsultantInvite.js', () => ({
  default: { findOne: jest.fn().mockResolvedValue(null) },
}));

jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: { create: jest.fn().mockResolvedValue({}) },
}));

jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({}),
  buildFromHeader: jest.fn(),
}));

// Factory must export every name billing.js imports from any .jsx path.
jest.unstable_mockModule(
  '../../backend/src/emails/templates/admin/DemoLeadCapture.jsx',
  () => ({
    default: () => null,
    DemoLeadCapture: () => null,
    SalesNotification: () => null,
    SubscriptionCancelled: () => null,
    PaymentFailed: () => null,
    SignupWelcome: () => null,
    TrialWelcome: () => null,
    ConsultantAccessGrantedEmail: () => null,
    ConsultantAccessDeclinedEmail: () => null,
    ConsultantMonthlyStatementEmail: () => null,
  }),
);

const { publicRouter: billingPublic, protectedRouter: billingProtected } =
  await import('../../backend/src/routes/billing.js');

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());

  // Mount public routes normally.
  app.use('/api/billing', billingPublic);

  // Simulate authenticate by injecting req.user via a stub middleware,
  // then mount the protected router. Tests can vary req.user per case.
  app.use('/api/billing', (req, _res, next) => {
    req.user = req._testUser || null;
    next();
  });
  app.use('/api/billing', billingProtected);
});

beforeEach(() => {
  verifyRecaptchaMock.mockReset();
  enqueueTemplateEmailMock.mockReset();
  enqueueTemplateEmailMock.mockResolvedValue({});
  delete process.env.LEAD_CAPTURE_EMAIL;
});

afterEach(() => {
  delete process.env.LEAD_CAPTURE_EMAIL;
});

// ---------------------------------------------------------------------------
// Helper: set req._testUser so the stub middleware picks it up.
// ---------------------------------------------------------------------------
function withUser(userObj) {
  // Supertest doesn't support per-request middleware injection directly.
  // We piggyback on a custom header that the stub middleware reads.
  // Instead, rebuild app per describe block or use a global mutable.
  // For simplicity we use a module-level variable that the stub reads.
  return userObj;
}

// Mutable injection for protected-router tests.
let injectedUser = null;

beforeAll(() => {
  // Rebuild app with dynamic user injection for protected routes.
  app = express();
  app.use(express.json());
  app.use('/api/billing', billingPublic);
  app.use('/api/billing', (req, _res, next) => {
    req.user = injectedUser;
    next();
  });
  app.use('/api/billing', billingProtected);
});

// ---------------------------------------------------------------------------
describe('Issue #566 -- POST /api/billing/demo-access', () => {
  it('case 1: missing recaptchaToken returns 400 RECAPTCHA_REQUIRED', async () => {
    const res = await request(app).post('/api/billing/demo-access').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECAPTCHA_REQUIRED');
    expect(verifyRecaptchaMock).not.toHaveBeenCalled();
  });

  it('case 2: failed reCAPTCHA returns 400 RECAPTCHA_FAILED', async () => {
    verifyRecaptchaMock.mockResolvedValue({ success: false });

    const res = await request(app)
      .post('/api/billing/demo-access')
      .send({ recaptchaToken: 'bad-token' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECAPTCHA_FAILED');
  });

  it('case 3: unconfigured reCAPTCHA returns 503 RECAPTCHA_NOT_CONFIGURED', async () => {
    const err = Object.assign(new Error('not configured'), { statusCode: 503 });
    verifyRecaptchaMock.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/billing/demo-access')
      .send({ recaptchaToken: 'any' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('RECAPTCHA_NOT_CONFIGURED');
  });

  it('case 4: upstream reCAPTCHA error returns 400 RECAPTCHA_ERROR', async () => {
    verifyRecaptchaMock.mockRejectedValue(new Error('timeout'));

    const res = await request(app)
      .post('/api/billing/demo-access')
      .send({ recaptchaToken: 'any' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECAPTCHA_ERROR');
  });

  it('case 5: valid token without email returns 201 with demo JWT and user', async () => {
    verifyRecaptchaMock.mockResolvedValue({ success: true });

    const res = await request(app)
      .post('/api/billing/demo-access')
      .send({ recaptchaToken: 'valid-token' });

    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.organizationId).toBe('demo-corp');
    expect(res.body.user.isDemo).toBe(true);
    expect(res.body.user.demoRole).toBe('user');
    expect(res.body.user.organizationId).toBe('demo-corp');
    expect(res.body.user.isAdmin).toBe(false);
    expect(enqueueTemplateEmailMock).not.toHaveBeenCalled();
  });

  it('case 6: valid token with email enqueues lead capture when LEAD_CAPTURE_EMAIL set', async () => {
    verifyRecaptchaMock.mockResolvedValue({ success: true });
    process.env.LEAD_CAPTURE_EMAIL = 'leads@example.com';

    const res = await request(app)
      .post('/api/billing/demo-access')
      .send({ recaptchaToken: 'valid-token', email: 'visitor@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('visitor@example.com');
    // enqueueTemplateEmail is fire-and-forget (.catch); allow a tick to settle
    await new Promise((r) => setImmediate(r));
    expect(enqueueTemplateEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'leads@example.com',
        type: 'demo_lead',
      }),
    );
  });

  it('case 7: valid token with email but no LEAD_CAPTURE_EMAIL does not enqueue', async () => {
    verifyRecaptchaMock.mockResolvedValue({ success: true });
    // LEAD_CAPTURE_EMAIL is NOT set (cleared in beforeEach)

    const res = await request(app)
      .post('/api/billing/demo-access')
      .send({ recaptchaToken: 'valid-token', email: 'visitor@example.com' });

    expect(res.status).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(enqueueTemplateEmailMock).not.toHaveBeenCalled();
  });
});

describe('Issue #566 -- POST /api/billing/demo-switch-role', () => {
  beforeEach(() => {
    injectedUser = null;
  });

  it('case 1: unauthenticated (no user) returns 401 or 403', async () => {
    injectedUser = null;

    const res = await request(app)
      .post('/api/billing/demo-switch-role')
      .send({ demoRole: 'admin' });

    // The protected router returns 403 NOT_DEMO_USER when req.user is null
    // because !req.user?.isDemo is true.
    expect([401, 403]).toContain(res.status);
  });

  it('case 2: non-demo user returns 403 NOT_DEMO_USER', async () => {
    injectedUser = { id: 'u1', organizationId: 'real-org', isDemo: false };

    const res = await request(app)
      .post('/api/billing/demo-switch-role')
      .send({ demoRole: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_DEMO_USER');
  });

  it('case 3: demo user switching to admin returns new JWT with admin role', async () => {
    injectedUser = {
      id: '55555555-5555-5555-5555-555555555555',
      organizationId: 'demo-corp',
      isDemo: true,
      demoRole: 'user',
      visitorEmail: null,
    };

    const res = await request(app)
      .post('/api/billing/demo-switch-role')
      .send({ demoRole: 'admin' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.demoRole).toBe('admin');
    expect(res.body.user.isAdmin).toBe(true);
    expect(res.body.user.isDemo).toBe(true);
  });

  it('case 4: demo user switching to user returns new JWT with user role', async () => {
    injectedUser = {
      id: '66666666-6666-6666-6666-666666666666',
      organizationId: 'demo-corp',
      isDemo: true,
      demoRole: 'admin',
      visitorEmail: 'v@example.com',
    };

    const res = await request(app)
      .post('/api/billing/demo-switch-role')
      .send({ demoRole: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.user.demoRole).toBe('user');
    expect(res.body.user.isAdmin).toBe(false);
  });

  it('case 5: invalid demoRole defaults to user', async () => {
    injectedUser = {
      id: '55555555-5555-5555-5555-555555555555',
      organizationId: 'demo-corp',
      isDemo: true,
      demoRole: 'user',
      visitorEmail: null,
    };

    const res = await request(app)
      .post('/api/billing/demo-switch-role')
      .send({ demoRole: 'superadmin' });

    expect(res.status).toBe(200);
    expect(res.body.user.demoRole).toBe('user');
  });
});
