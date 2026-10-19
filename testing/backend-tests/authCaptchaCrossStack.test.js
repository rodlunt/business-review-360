/**
 * Issue #559 regression guard.
 *
 * Cross-stack reCAPTCHA verification on /auth/login, /auth/request-password-reset
 * (+ its /auth/recover alias), and /auth/reset-password. Follows the #476
 * register-only pattern.
 *
 * Each handler path tested here covers:
 *   1. no recaptchaToken attached  -> verifyRecaptcha NOT called (per-tenant
 *      useCaptcha is false; preserve current behaviour)
 *   2. token attached, verify returns { success: false }
 *      - /auth/login                -> 401 Invalid credentials (oracle-safe,
 *        identical to a bad password; do not leak that the user exists)
 *      - /auth/request-password-reset -> generic "if an account exists..."
 *        200 response (do NOT 400 - would narrow #540 enumeration guard)
 *      - /auth/reset-password       -> 400 reCAPTCHA failed (no enumeration
 *        concern - reset token itself is the secret)
 *   3. RECAPTCHA_SECRET_KEY unset (helper throws { statusCode: 503 })
 *      -> 503 on every handler so a misconfigured server cannot be mistaken
 *      for valid user feedback
 */
import { jest } from '@jest/globals';

const orgId = 'org-under-test';
const tenantId = '11111111-1111-1111-1111-111111111111';

const mockSequelize = {
  transaction: jest.fn(),
  query: jest.fn(),
};

const mockUser = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
};

const mockOrganization = {
  findOne: jest.fn(),
};

const mockPlatformSequelize = {
  query: jest.fn(),
};

const mockGetTenantId = jest.fn();
const mockGenerateToken = jest.fn(() => ({ token: 'access-token', jti: 'test-jti' }));
const mockVerifyRecaptcha = jest.fn();
const mockSendPasswordResetEmail = jest.fn().mockResolvedValue(true);

jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendPasswordResetEmail: mockSendPasswordResetEmail,
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/models/User.js', () => ({
  default: mockUser,
}));

jest.unstable_mockModule('../../backend/src/models/index.js', () => ({
  sequelize: mockSequelize,
}));

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: mockOrganization,
}));

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: mockPlatformSequelize,
}));

jest.unstable_mockModule('../../backend/src/middleware/tenantResolver.js', () => ({
  getTenantId: mockGetTenantId,
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  // #720: passthrough authenticate so the protectedRouter mount does not
  // trip the "argument handler must be a function" check at app.use time.
  // No protected endpoints are exercised in this suite; the passthrough is
  // never invoked by these test cases.
  authenticate: (req, res, next) => next(),
  generateToken: mockGenerateToken,
  // #490: createSession, revokeAllSessions mocked so tests don't hit DB.
  createSession: jest.fn().mockResolvedValue({}),
  revokeAllSessions: jest.fn().mockResolvedValue(0),
  ACCESS_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

jest.unstable_mockModule('../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptcha: mockVerifyRecaptcha,
}));

// #720: auth.js now exports publicRouter + protectedRouter.
const { publicRouter: authPublic, protectedRouter: authProtected } = await import('../../backend/src/routes/auth.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const { describe, it, expect, beforeEach } = await import('@jest/globals');
const request = (await import('supertest')).default;
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use('/api/auth', authPublic);
app.use('/api/auth', authenticate, authProtected);

const fakeTransaction = Symbol('fakeTransaction');
const KNOWN_TOKEN = 'frontend-issued-token';

beforeEach(() => {
  jest.clearAllMocks();

  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTransaction));
  mockSequelize.query.mockResolvedValue([[], []]);

  mockGetTenantId.mockResolvedValue(tenantId);
  mockPlatformSequelize.query.mockResolvedValue([{ id: tenantId }]);

  // Default success so tests only override when asserting failure paths.
  mockVerifyRecaptcha.mockResolvedValue({ success: true, score: 0.9 });
});

describe('Issue #559 - /auth/login reCAPTCHA verify', () => {
  beforeEach(() => {
    mockUser.findOne.mockResolvedValue(null);
  });

  it('does NOT call verifyRecaptcha when no recaptchaToken is attached', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'irrelevant', organizationId: orgId });

    expect(mockVerifyRecaptcha).not.toHaveBeenCalled();
  });

  it('calls verifyRecaptcha with token + client IP when token is attached', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'irrelevant',
        organizationId: orgId,
        recaptchaToken: KNOWN_TOKEN,
      });

    expect(mockVerifyRecaptcha).toHaveBeenCalledTimes(1);
    expect(mockVerifyRecaptcha).toHaveBeenCalledWith(KNOWN_TOKEN, expect.any(String));
  });

  it('returns 401 Invalid credentials when reCAPTCHA reports success:false', async () => {
    mockVerifyRecaptcha.mockResolvedValue({ success: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'irrelevant',
        organizationId: orgId,
        recaptchaToken: KNOWN_TOKEN,
      });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
    // User.findOne must NOT be called - reCAPTCHA short-circuits before the
    // tenant-scoped lookup so a bot cannot use login to probe the user table.
    expect(mockUser.findOne).not.toHaveBeenCalled();
  });

  it('returns 503 when RECAPTCHA_SECRET_KEY is unset (helper throws statusCode:503)', async () => {
    const err = new Error('RECAPTCHA_SECRET_KEY not configured');
    err.statusCode = 503;
    mockVerifyRecaptcha.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'irrelevant',
        organizationId: orgId,
        recaptchaToken: KNOWN_TOKEN,
      });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('RECAPTCHA_NOT_CONFIGURED');
  });
});

describe('Issue #559 - /auth/request-password-reset + /auth/recover reCAPTCHA verify', () => {
  beforeEach(() => {
    // No registered user so the happy path returns the generic 200.
    mockUser.findOne.mockResolvedValue(null);
  });

  describe.each([
    '/api/auth/request-password-reset',
    '/api/auth/recover',
  ])('POST %s', (path) => {
    it('does NOT call verifyRecaptcha when no recaptchaToken is attached', async () => {
      await request(app).post(path).send({ email: 'someone@example.com' });
      expect(mockVerifyRecaptcha).not.toHaveBeenCalled();
    });

    it('calls verifyRecaptcha when token is attached', async () => {
      await request(app).post(path).send({
        email: 'someone@example.com',
        recaptchaToken: KNOWN_TOKEN,
      });
      expect(mockVerifyRecaptcha).toHaveBeenCalledWith(KNOWN_TOKEN, expect.any(String));
    });

    it('returns generic 200 (NOT 400) when reCAPTCHA reports success:false, preserving #540 enumeration guard', async () => {
      mockVerifyRecaptcha.mockResolvedValue({ success: false });

      const res = await request(app).post(path).send({
        email: 'someone@example.com',
        recaptchaToken: KNOWN_TOKEN,
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: expect.stringMatching(/If an account exists/i),
      });
      // No DB lookup when captcha short-circuits - prevents timing-based
      // enumeration on top of response-body equality.
      expect(mockUser.findOne).not.toHaveBeenCalled();
    });

    it('returns 503 when RECAPTCHA_SECRET_KEY is unset', async () => {
      const err = new Error('RECAPTCHA_SECRET_KEY not configured');
      err.statusCode = 503;
      mockVerifyRecaptcha.mockRejectedValue(err);

      const res = await request(app).post(path).send({
        email: 'someone@example.com',
        recaptchaToken: KNOWN_TOKEN,
      });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('RECAPTCHA_NOT_CONFIGURED');
    });
  });
});

describe('Issue #559 - /auth/reset-password reCAPTCHA verify', () => {
  // /reset-password looks up the user by hashed reset token. We mock findOne
  // to return null so the flow reaches the 400 invalid-token branch; the
  // reCAPTCHA gate must run (or skip) before that lookup.
  beforeEach(() => {
    mockUser.findOne.mockResolvedValue(null);
  });

  it('does NOT call verifyRecaptcha when no recaptchaToken is attached', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'some-reset-token', password: 'Abcdef1!' });

    expect(mockVerifyRecaptcha).not.toHaveBeenCalled();
  });

  it('calls verifyRecaptcha when token is attached', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'some-reset-token',
        password: 'Abcdef1!',
        recaptchaToken: KNOWN_TOKEN,
      });

    expect(mockVerifyRecaptcha).toHaveBeenCalledWith(KNOWN_TOKEN, expect.any(String));
  });

  it('returns 400 RECAPTCHA_FAILED when reCAPTCHA reports success:false', async () => {
    mockVerifyRecaptcha.mockResolvedValue({ success: false });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'some-reset-token',
        password: 'Abcdef1!',
        recaptchaToken: KNOWN_TOKEN,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RECAPTCHA_FAILED');
    expect(mockUser.findOne).not.toHaveBeenCalled();
  });

  it('returns 503 when RECAPTCHA_SECRET_KEY is unset', async () => {
    const err = new Error('RECAPTCHA_SECRET_KEY not configured');
    err.statusCode = 503;
    mockVerifyRecaptcha.mockRejectedValue(err);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'some-reset-token',
        password: 'Abcdef1!',
        recaptchaToken: KNOWN_TOKEN,
      });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('RECAPTCHA_NOT_CONFIGURED');
  });
});
