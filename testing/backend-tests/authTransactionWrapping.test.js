/**
 * Issue #562 regression guard (structural).
 *
 * `auth.js` previously ran `SET LOCAL app.tenant_id = ...` outside any
 * transaction at lines 283 (/auth/register) and 435 (/auth/login). In
 * Postgres, `SET LOCAL` is scoped to the current transaction and Sequelize
 * auto-commits single-statement queries immediately, so the tenant value
 * applied only to the setting statement itself and did not persist to the
 * follow-up `Organization.findOne` / `User.findOne` calls. RLS on `Users`
 * would then filter against whatever stale session state the pooled
 * connection was left in by a prior request.
 *
 * This suite asserts the structural fix landed: both routes wrap the
 * tenant-context setup + follow-up queries in a `sequelize.transaction(...)`
 * block and pass `{ transaction: t }` to every call inside it.
 *
 * End-to-end RLS behaviour coverage against a real Postgres instance is
 * tracked in #564 (needs a Jest-friendly Postgres harness that #480 and #561
 * will also depend on).
 */
import { jest } from '@jest/globals';

const orgId = 'org-under-test';
const tenantId = '11111111-1111-1111-1111-111111111111';

// Shared mock handles exposed so tests can inspect / reconfigure them per case.
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
  // #490: createSession records issued tokens; mocked so tests don't hit DB.
  createSession: jest.fn().mockResolvedValue({}),
  ACCESS_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

jest.unstable_mockModule('../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true }),
}));

// #892: /auth/register now dynamically imports findUniqueUsername from
// oauth.js (same helper /demo-signup uses) to auto-generate the display
// username. Mocked because `User` above is a plain jest mock, not a
// Sequelize.Model subclass -- loading the real oauth.js (which pulls in
// OAuthLink's `belongsTo(User, ...)` association) would throw at import
// time otherwise.
jest.unstable_mockModule('../../backend/src/routes/oauth.js', () => ({
  findUniqueUsername: jest.fn().mockResolvedValue('newuser'),
  publicRouter: { post: () => {}, get: () => {} },
  protectedRouter: { post: () => {}, get: () => {} },
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

const findSetLocalCall = () =>
  mockSequelize.query.mock.calls.find(([sql]) => /SET\s+LOCAL\s+app\.tenant_id/i.test(sql));

beforeEach(() => {
  jest.clearAllMocks();

  // Default: transaction runs the callback with a fake token and returns its result.
  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTransaction));
  mockSequelize.query.mockResolvedValue([[], []]);

  mockGetTenantId.mockResolvedValue(tenantId);
  mockPlatformSequelize.query.mockResolvedValue([{ id: tenantId }]);
});

describe('Issue #562 - /auth/login wraps SET LOCAL in a transaction', () => {
  beforeEach(() => {
    // Short-circuit the flow at User.findOne returning null. We only need the
    // handler to reach the transaction; the 401 response is expected.
    mockUser.findOne.mockResolvedValue(null);
  });

  it('calls sequelize.transaction', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'irrelevant', organizationId: orgId });

    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(mockSequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it('runs SET LOCAL inside the transaction with { transaction: t }', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'irrelevant', organizationId: orgId });

    const setLocalCall = findSetLocalCall();
    expect(setLocalCall).toBeDefined();
    expect(setLocalCall[1]).toEqual(expect.objectContaining({ transaction: fakeTransaction }));
  });

  it('passes the same transaction to User.findOne', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'irrelevant', organizationId: orgId });

    // #892: org-scoped login now looks up by the normalised email, not
    // username.
    expect(mockUser.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'alice@example.com' },
        transaction: fakeTransaction,
      })
    );
  });
});

describe('Issue #562 - /auth/register wraps SET LOCAL in a transaction', () => {
  beforeEach(() => {
    // #892: the email-uniqueness pre-check (only check left, username is
    // no longer user input) returns null so the flow reaches the
    // transaction-wrapped block.
    mockUser.findOne.mockResolvedValue(null);
    // Short-circuit on Organization.findOne returning null so the handler
    // returns 400 without needing User.create / email mocks to succeed.
    mockOrganization.findOne.mockResolvedValue(null);
  });

  it('calls sequelize.transaction', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        password: 'Abcdef1!',
        email: 'new@example.com',
        organizationId: orgId,
      });

    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(mockSequelize.transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it('runs SET LOCAL inside the transaction with { transaction: t }', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        password: 'Abcdef1!',
        email: 'new@example.com',
        organizationId: orgId,
      });

    const setLocalCall = findSetLocalCall();
    expect(setLocalCall).toBeDefined();
    expect(setLocalCall[1]).toEqual(expect.objectContaining({ transaction: fakeTransaction }));
  });

  it('passes the same transaction to Organization.findOne', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        password: 'Abcdef1!',
        email: 'new@example.com',
        organizationId: orgId,
      });

    // Issue #733 -- the lookup must filter by the VARCHAR `organizationId`
    // handle, not by the UUID `id` primary key. The previous form
    // `where: { id: orgId }` always returned null and short-circuited
    // registration to a 400 "Organization not found" response.
    expect(mockOrganization.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: orgId },
        transaction: fakeTransaction,
      })
    );
  });
});
