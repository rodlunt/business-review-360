/**
 * Onboarding plan Phase 2a behavioural coverage.
 *
 * Slice 2a is additive on the auth surface; this suite asserts the three
 * new behaviours directly (no existing harness covered these routes):
 *   - GET  /api/auth/memberships  returns the user's primaryOrganizationId
 *   - POST /api/auth/select-org   persists primaryOrganizationId (last wins)
 *   - POST /api/auth/register     captures an optional referralCode (soft)
 *
 * Mocking pattern mirrors authTransactionWrapping.test.js (issue #562):
 * models + middleware are mocked via jest.unstable_mockModule before the
 * router is imported. `router` in auth.js is `publicRouter`, so /register
 * and /select-org mount on the public router; /memberships is protected.
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-onboarding-phase2a';
process.env.JWT_SECRET = JWT_SECRET;

const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1';

const mockUser = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  findByPk: jest.fn(),
};
const mockUOM = { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() };
const mockOrg = { findOne: jest.fn(), findAll: jest.fn() };
const mockSequelize = { transaction: jest.fn(), query: jest.fn() };
const mockPlatformSequelize = { query: jest.fn() };
const mockGetTenantId = jest.fn();
const mockGenerateToken = jest.fn(() => ({ token: 'access-token', jti: 'jti-1' }));
const mockCreateSession = jest.fn().mockResolvedValue({});

jest.unstable_mockModule('../../backend/src/models/User.js', () => ({ default: mockUser }));
jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: mockUOM,
}));
jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({ default: mockOrg }));
jest.unstable_mockModule('../../backend/src/models/index.js', () => ({ sequelize: mockSequelize }));
jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: mockPlatformSequelize,
}));
jest.unstable_mockModule('../../backend/src/middleware/tenantResolver.js', () => ({
  getTenantId: mockGetTenantId,
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  // Passthrough authenticate that injects req.user so the protected
  // /memberships route can run without a real token pipeline.
  authenticate: (req, _res, next) => {
    req.user = { id: TEST_USER_ID };
    next();
  },
  generateToken: mockGenerateToken,
  createSession: mockCreateSession,
  ACCESS_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));
jest.unstable_mockModule('../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true }),
}));
jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  redactForAudit: (x) => x,
}));
jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));
// #892: /auth/register now dynamically imports findUniqueUsername from
// oauth.js. Mocked because `User` above is a plain jest mock, not a
// Sequelize.Model subclass -- loading the real oauth.js (which pulls in
// OAuthLink's `belongsTo(User, ...)` association) would throw at import
// time otherwise.
jest.unstable_mockModule('../../backend/src/routes/oauth.js', () => ({
  findUniqueUsername: jest.fn().mockResolvedValue('newuser'),
  publicRouter: { post: () => {}, get: () => {} },
  protectedRouter: { post: () => {}, get: () => {} },
}));

const { publicRouter: authPublic, protectedRouter: authProtected } = await import(
  '../../backend/src/routes/auth.js'
);
const { authenticate } = await import('../../backend/src/middleware/auth.js');
const { describe, it, expect, beforeEach } = await import('@jest/globals');
const request = (await import('supertest')).default;
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use('/api/auth', authPublic);
app.use('/api/auth', authenticate, authProtected);

const fakeTx = Symbol('tx');

beforeEach(() => {
  jest.clearAllMocks();
  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTx));
  mockSequelize.query.mockResolvedValue([[], []]);
  mockGenerateToken.mockReturnValue({ token: 'access-token', jti: 'jti-1' });
  mockCreateSession.mockResolvedValue({});
});

describe('Phase 2a -- POST /api/auth/register captures referralCode', () => {
  beforeEach(() => {
    mockPlatformSequelize.query.mockResolvedValue([{ id: 'tenant-1' }]);
    mockOrg.findOne.mockResolvedValue({
      organizationId: 'demo-corp',
      allowSelfRegistration: true,
      oauthAutoSuperuser: false,
    });
    mockUser.findOne.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', organizationId: 'demo-corp' });
    mockUOM.create.mockResolvedValue({});
  });

  it('stores referredByConsultantCode + referralCapturedAt when a code is sent', async () => {
    await request(app).post('/api/auth/register').send({
      password: 'Password123!',
      email: 'a@b.com',
      organizationId: 'demo-corp',
      referralCode: 'acme-1234',
    });

    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referredByConsultantCode: 'acme-1234',
        referralCapturedAt: expect.any(Date),
      }),
      expect.objectContaining({ transaction: fakeTx }),
    );
  });

  it('does not set referral fields when no code is sent', async () => {
    await request(app).post('/api/auth/register').send({
      password: 'Password123!',
      email: 'a@b.com',
      organizationId: 'demo-corp',
    });

    expect(mockUser.create).toHaveBeenCalled();
    const createArg = mockUser.create.mock.calls[0][0];
    expect(createArg.referredByConsultantCode).toBeUndefined();
    expect(createArg.referralCapturedAt).toBeUndefined();
  });

  it('ignores a blank/whitespace referralCode', async () => {
    await request(app).post('/api/auth/register').send({
      password: 'Password123!',
      email: 'a@b.com',
      organizationId: 'demo-corp',
      referralCode: '   ',
    });

    const createArg = mockUser.create.mock.calls[0][0];
    expect(createArg.referredByConsultantCode).toBeUndefined();
  });
});

describe('Phase 2a -- GET /api/auth/memberships returns primaryOrganizationId', () => {
  beforeEach(() => {
    mockUOM.findAll.mockResolvedValue([
      { organizationId: 'org-a', isAdmin: false, isSuperuser: true },
    ]);
    mockOrg.findAll.mockResolvedValue([{ organizationId: 'org-a', organizationName: 'Org A' }]);
  });

  it('returns the stored primaryOrganizationId alongside memberships', async () => {
    mockUser.findByPk.mockResolvedValue({ primaryOrganizationId: 'org-a' });

    const res = await request(app).get('/api/auth/memberships');

    expect(res.status).toBe(200);
    expect(res.body.primaryOrganizationId).toBe('org-a');
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].organizationId).toBe('org-a');
  });

  it('returns null primaryOrganizationId when none is set', async () => {
    mockUser.findByPk.mockResolvedValue({ primaryOrganizationId: null });

    const res = await request(app).get('/api/auth/memberships');

    expect(res.status).toBe(200);
    expect(res.body.primaryOrganizationId).toBeNull();
  });
});

describe('Phase 2a -- POST /api/auth/select-org persists primary (last wins)', () => {
  const pickToken = jwt.sign({ id: TEST_USER_ID, step: 'org-pick' }, JWT_SECRET, {
    algorithm: 'HS256',
  });

  function fakeUser(primaryOrganizationId) {
    return {
      id: TEST_USER_ID,
      username: 'picker',
      isAnonymous: false,
      hasSeenSuperuserWalkthrough: false,
      hasSeenAdminWalkthrough: false,
      hasSeenUserWalkthrough: false,
      primaryOrganizationId,
      update: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    mockUOM.findOne.mockResolvedValue({ isAdmin: false, isSuperuser: true });
  });

  it('updates primaryOrganizationId to the chosen org', async () => {
    const user = fakeUser('org-old');
    mockUser.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/select-org')
      .send({ pickToken, organizationId: 'org-new' });

    expect(res.status).toBe(200);
    expect(user.update).toHaveBeenCalledWith({ primaryOrganizationId: 'org-new' });
  });

  it('does not rewrite primaryOrganizationId when the chosen org is already primary', async () => {
    const user = fakeUser('org-same');
    mockUser.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/select-org')
      .send({ pickToken, organizationId: 'org-same' });

    expect(res.status).toBe(200);
    // #892 PR1: select-org always writes lastActiveAt on success, but must
    // NOT touch primaryOrganizationId when it already matches the choice.
    expect(user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ primaryOrganizationId: expect.anything() }),
    );
    expect(user.update).toHaveBeenCalledWith({ lastActiveAt: expect.any(Date) });
  });
});
