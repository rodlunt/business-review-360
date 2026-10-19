/**
 * Issue #892 -- org-scoped /auth/login accepts email, not username.
 *
 * Clean removal (no backward-compat shim): username is no longer a
 * credential anywhere on POST /auth/login. This suite covers the
 * org-scoped branch's new email-keyed lookup and its timing-parity
 * failure modes, mirroring the org-less coverage already in
 * onboardingPhase5a.test.js:
 *   - unknown email        -> 401 Invalid credentials (dummy verify runs)
 *   - OAuth-only user (null passwordHash) -> 401 (dummy verify runs,
 *     never passes null into verifyPassword)
 *   - wrong password       -> 401 Invalid credentials
 *   - correct password     -> 200 { token, user } (org-scoped shape,
 *     unchanged, still includes `username` as a display name)
 *   - email is trim + lowercase normalised before the lookup
 *   - anonymous (null-email) accounts are structurally unreachable: the
 *     lookup is always by a non-empty validated email, and NULL never
 *     equality-matches a string, so an anonymous row can never be the
 *     row returned here
 *
 * Scaffold mirrors authIsApprovedGate.test.js / authTransactionWrapping.test.js
 * (models/index.js sequelize + User/UserOrganizationMembership mocked;
 * passwordHash.js mocked so call order/arguments -- not real hashing -- is
 * what's under test).
 */
import { jest } from '@jest/globals';

const orgId = 'org-under-test';
const tenantId = '11111111-1111-1111-1111-111111111111';
const fakeTransaction = Symbol('fakeTransaction');

const mockSequelize = {
  transaction: jest.fn(),
  query: jest.fn(),
};

const mockUser = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  findByPk: jest.fn(),
};

const mockUserOrganizationMembership = {
  findOne: jest.fn(),
};

const mockOrganization = {
  findAll: jest.fn(),
};

const mockPlatformSequelize = {
  query: jest.fn(),
};

const mockGetTenantId = jest.fn();
const mockGenerateToken = jest.fn(() => ({ token: 'access-token', jti: 'test-jti' }));
const mockCreateSession = jest.fn().mockResolvedValue({});

const mockVerifyPassword = jest.fn();
const mockVerifyDummy = jest.fn().mockResolvedValue(undefined);
const mockUpgradeHashIfNeeded = jest.fn().mockResolvedValue(undefined);
const mockHashPassword = jest.fn();

jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
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

jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: mockUserOrganizationMembership,
}));

jest.unstable_mockModule('../../backend/src/middleware/tenantResolver.js', () => ({
  getTenantId: mockGetTenantId,
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => next(),
  generateToken: mockGenerateToken,
  createSession: mockCreateSession,
  revokeAllSessions: jest.fn().mockResolvedValue(0),
  ACCESS_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

jest.unstable_mockModule('../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../../backend/src/utils/passwordHash.js', () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
  verifyDummy: mockVerifyDummy,
  upgradeHashIfNeeded: mockUpgradeHashIfNeeded,
}));

const { publicRouter: authPublic, protectedRouter: authProtected } =
  await import('../../backend/src/routes/auth.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const { describe, it, expect, beforeEach } = await import('@jest/globals');
const request = (await import('supertest')).default;
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use('/api/auth', authPublic);
app.use('/api/auth', authenticate, authProtected);

const PASSWORD = 'Correct-Horse-9';

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    passwordHash: '$argon2id$irrelevant-hash',
    isAnonymous: false,
    isAdmin: false,
    hasSeenSuperuserWalkthrough: false,
    hasSeenAdminWalkthrough: false,
    hasSeenUserWalkthrough: false,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTransaction));
  mockSequelize.query.mockResolvedValue([[], []]);

  mockGetTenantId.mockResolvedValue(tenantId);
  mockPlatformSequelize.query.mockResolvedValue([{ id: tenantId }]);

  mockVerifyPassword.mockResolvedValue(true);
  mockVerifyDummy.mockResolvedValue(undefined);
  mockUpgradeHashIfNeeded.mockResolvedValue(undefined);
});

// #980: a present-but-non-string organizationId must be rejected by the
// validator chain before getTenantId or any query runs. Absent
// organizationId (the org-less branch) is covered by the existing
// multi-org tests and stays untouched.
describe('#980 - organizationId type guard', () => {
  it('400s an object organizationId before any tenant lookup', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: PASSWORD, organizationId: { slug: orgId } });

    expect(res.status).toBe(400);
    expect(mockGetTenantId).not.toHaveBeenCalled();
    expect(mockUser.findOne).not.toHaveBeenCalled();
  });

  it('400s an array organizationId before any tenant lookup', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: PASSWORD, organizationId: [orgId] });

    expect(res.status).toBe(400);
    expect(mockGetTenantId).not.toHaveBeenCalled();
    expect(mockUser.findOne).not.toHaveBeenCalled();
  });
});

describe('#892 - org-scoped /auth/login looks up by email', () => {
  it('looks the user up by the trimmed, lowercased email inside the RLS transaction', async () => {
    mockUser.findOne.mockResolvedValue(null);

    await request(app)
      .post('/api/auth/login')
      .send({ email: '  Alice@Example.COM  ', password: PASSWORD, organizationId: orgId });

    expect(mockUser.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'alice@example.com' },
        transaction: fakeTransaction,
      })
    );
  });

  it('401 for an unknown email, and still runs verifyDummy for timing parity', async () => {
    mockUser.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: PASSWORD, organizationId: orgId });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
    expect(mockVerifyDummy).toHaveBeenCalledWith(PASSWORD);
    expect(mockVerifyPassword).not.toHaveBeenCalled();

    // Structural proof that an anonymous (NULL-email) User row can never
    // be the row this lookup returns: the query always filters by a
    // non-empty, validator-guaranteed email string, and SQL NULL never
    // equality-matches a string. An anonymous account therefore behaves
    // identically to "unknown email" here -- this same 401 path.
  });

  it('401 for an OAuth-only user (null passwordHash), and never passes null into verifyPassword', async () => {
    mockUser.findOne.mockResolvedValue(makeUser({ passwordHash: null }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: PASSWORD, organizationId: orgId });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
    expect(mockVerifyDummy).toHaveBeenCalledWith(PASSWORD);
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it('401 for a known email with the wrong password', async () => {
    mockUser.findOne.mockResolvedValue(makeUser());
    mockVerifyPassword.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong-password', organizationId: orgId });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
    expect(mockUpgradeHashIfNeeded).not.toHaveBeenCalled();
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it('200 with a token + user payload for a correct email + password + approved membership', async () => {
    const user = makeUser();
    mockUser.findOne.mockResolvedValue(user);
    mockUserOrganizationMembership.findOne.mockResolvedValue({
      isAdmin: true,
      isSuperuser: false,
      isApproved: true,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: PASSWORD, organizationId: orgId });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('access-token');
    expect(res.body.user).toMatchObject({
      id: 'user-1',
      username: 'alice',
      isAdmin: true,
      organizationId: orgId,
    });
    expect(mockUpgradeHashIfNeeded).toHaveBeenCalledWith(user, PASSWORD, expect.anything());
    expect(mockGenerateToken).toHaveBeenCalledWith('user-1', orgId);
    expect(user.update).toHaveBeenCalledWith({ lastActiveAt: expect.any(Date) });
  });

  it('403 ACCOUNT_PENDING for a correct email + password but unapproved membership', async () => {
    mockUser.findOne.mockResolvedValue(makeUser());
    mockUserOrganizationMembership.findOne.mockResolvedValue({
      isAdmin: false,
      isSuperuser: false,
      isApproved: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: PASSWORD, organizationId: orgId });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_PENDING');
  });
});
