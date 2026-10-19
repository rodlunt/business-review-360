/**
 * Issue #760 -- reCAPTCHA gate on POST /api/billing/trial-signup.
 *
 * Verifies that the endpoint rejects requests with a missing, failed, or
 * error-producing reCAPTCHA token before any DB writes occur, and that a
 * valid token passes through to the handler logic.
 *
 * Mocks via jest.unstable_mockModule are mandatory here because:
 *   - billing.js calls `new Stripe(...)` at import time.
 *   - verifyRecaptcha must be injectable so tests can control success/failure.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// --- mocks must be registered BEFORE the router is imported -----------------

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

const platformQueryMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: platformQueryMock },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { findOne: jest.fn(), create: jest.fn().mockResolvedValue({}) },
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

jest.unstable_mockModule('../../backend/src/models/User.js', () => ({
  default: {
    create: jest.fn().mockResolvedValue({
      id: 'user-test-1',
      username: 'admin',
      email: 'admin@acme-corp.example',
      organizationId: 'acme-corp',
    }),
  },
}));

jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  enqueueTemplateEmail: jest.fn().mockResolvedValue({}),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));

jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({}),
  buildFromHeader: jest.fn(),
}));

// All *.jsx paths share one module slot (moduleNameMapper in backend/package.json).
// One factory call is sufficient; it must export every name billing.js imports.
jest.unstable_mockModule(
  '../../backend/src/emails/templates/notifications/SubscriptionCancelled.jsx',
  () => ({
    default: () => null,
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

const { publicRouter: billingPublic } = await import('../../backend/src/routes/billing.js');

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/billing', billingPublic);
});

beforeEach(() => {
  verifyRecaptchaMock.mockReset();
  platformQueryMock.mockReset();
});

const validBody = {
  orgIdDesired: 'acme-corp',
  adminUsername: 'admin',
  adminEmail: 'admin@acme-corp.example',
  adminPassword: 'Password123',
};

describe('Issue #760 -- POST /api/billing/trial-signup reCAPTCHA gate', () => {
  it('case 1: missing recaptchaToken returns 400 RECAPTCHA_REQUIRED', async () => {
    const res = await request(app)
      .post('/api/billing/trial-signup')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECAPTCHA_REQUIRED');
    expect(verifyRecaptchaMock).not.toHaveBeenCalled();
  });

  it('case 2: failed reCAPTCHA verification returns 400 RECAPTCHA_FAILED', async () => {
    verifyRecaptchaMock.mockResolvedValue({ success: false });

    const res = await request(app)
      .post('/api/billing/trial-signup')
      .send({ ...validBody, recaptchaToken: 'bad-token' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECAPTCHA_FAILED');
  });

  it('case 3: unconfigured reCAPTCHA returns 503 RECAPTCHA_NOT_CONFIGURED', async () => {
    const err = Object.assign(new Error('RECAPTCHA_SECRET_KEY not configured'), { statusCode: 503 });
    verifyRecaptchaMock.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/billing/trial-signup')
      .send({ ...validBody, recaptchaToken: 'any-token' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('RECAPTCHA_NOT_CONFIGURED');
  });

  it('case 4: upstream reCAPTCHA error returns 400 RECAPTCHA_ERROR', async () => {
    verifyRecaptchaMock.mockRejectedValue(new Error('network timeout'));

    const res = await request(app)
      .post('/api/billing/trial-signup')
      .send({ ...validBody, recaptchaToken: 'any-token' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECAPTCHA_ERROR');
  });

  it('case 5: valid token passes gate and reaches handler logic', async () => {
    verifyRecaptchaMock.mockResolvedValue({ success: true });
    // Make the org-exists check return a row so the handler short-circuits at
    // 409 ORG_ID_TAKEN -- proves the gate was passed without needing a full
    // DB fixture for provisioning, token issuance, and session creation.
    platformQueryMock.mockResolvedValue([{ id: 999 }]);

    const res = await request(app)
      .post('/api/billing/trial-signup')
      .send({ ...validBody, recaptchaToken: 'valid-token' });

    expect(verifyRecaptchaMock).toHaveBeenCalledWith('valid-token', expect.anything());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORG_ID_TAKEN');
  });

  it('case 6: invalid adminEmail format returns 400 INVALID_EMAIL (L1 fix)', async () => {
    verifyRecaptchaMock.mockResolvedValue({ success: true });

    const res = await request(app)
      .post('/api/billing/trial-signup')
      .send({ ...validBody, adminEmail: 'not-an-email', recaptchaToken: 'valid-token' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL');
    expect(verifyRecaptchaMock).toHaveBeenCalled();
  });
});
