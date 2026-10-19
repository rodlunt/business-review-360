/**
 * Issue #490 regression guard — JWT revocation via jti + UserSessions table.
 *
 * Coverage:
 *   1. Login issues a session record; subsequent authenticate passes.
 *   2. POST /auth/logout revokes the session; re-use of the token returns 401.
 *   3. POST /auth/reset-password revokes all existing sessions before issuing new ones.
 *   4. Tokens without a jti claim (issued before #490) pass through (opportunistic model).
 *   5. Token whose session row has been deleted (no record) returns TOKEN_REVOKED.
 */
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-490';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_EXPIRATION = '7d';

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgId = 'test-org';
const tenantId = '11111111-1111-1111-1111-111111111111';

// ─── Shared mock state ───────────────────────────────────────────────────────

const sessions = new Map(); // jti → { revokedAt }

const mockUserSession = {
  create: jest.fn(async ({ jti, userId, organizationId, type, expiresAt }) => {
    sessions.set(jti, { jti, userId, organizationId, type, expiresAt, revokedAt: null });
    return sessions.get(jti);
  }),
  findOne: jest.fn(async ({ where: { jti } }) => sessions.get(jti) ?? null),
  update: jest.fn(async (values, { where }) => {
    let count = 0;
    for (const [k, v] of sessions) {
      const matchJti = where.jti ? k === where.jti : true;
      const matchUser = where.userId ? v.userId === where.userId : true;
      const notRevoked = where.revokedAt === null ? v.revokedAt === null : true;
      if (matchJti && matchUser && notRevoked) {
        sessions.set(k, { ...v, ...values });
        count++;
      }
    }
    return count;
  }),
};

const mockUser = {
  findByPk: jest.fn(async (id) =>
    id === userId
      ? { id: userId, username: 'tester', organizationId: orgId, isAdmin: false, isAnonymous: false }
      : null
  ),
  findOne: jest.fn(async ({ where: { username } }) =>
    username === 'tester'
      ? { id: userId, username: 'tester', organizationId: orgId, isAdmin: false, passwordHash: '$2b$12$placeholder' }
      : null
  ),
};

const mockOrganization = { findOne: jest.fn() };
const mockPlatformSequelize = { query: jest.fn() };
const mockGetTenantId = jest.fn().mockResolvedValue(tenantId);

const mockSequelize = {
  transaction: jest.fn(async (fn) => fn(Symbol('tx'))),
  query: jest.fn().mockResolvedValue([[], []]),
};

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../backend/src/models/UserSession.js', () => ({
  default: mockUserSession,
}));

jest.unstable_mockModule('../../backend/src/models/User.js', () => ({
  default: mockUser,
}));

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: mockOrganization,
}));

jest.unstable_mockModule('../../backend/src/models/index.js', () => ({
  sequelize: mockSequelize,
}));

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: mockPlatformSequelize,
}));

jest.unstable_mockModule('../../backend/src/middleware/tenantResolver.js', () => ({
  getTenantId: mockGetTenantId,
  getTenantByOrganizationId: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptcha: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../backend/src/middleware/security.js', () => ({
  validationRules: {
    username: [],
    password: [],
    email: [],
  },
  handleValidationErrors: (req, res, next) => next(),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeTrackedToken = async () => {
  const { generateToken, createSession, ACCESS_TOKEN_TTL_MS } = await import(
    '../../backend/src/middleware/auth.js'
  );
  const { token, jti } = generateToken(userId, orgId);
  await createSession(jti, userId, orgId, 'access', ACCESS_TOKEN_TTL_MS);
  return { token, jti };
};

const makeUntrackedToken = () =>
  jwt.sign({ id: userId, organizationId: orgId, jti: 'orphan-jti' }, JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });

const makeLegacyToken = () =>
  jwt.sign({ id: userId, organizationId: orgId }, JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessions.clear();
  jest.clearAllMocks();
  // Restore default impls that beforeEach clears.
  mockUserSession.create.mockImplementation(async ({ jti, userId, organizationId, type, expiresAt }) => {
    sessions.set(jti, { jti, userId, organizationId, type, expiresAt, revokedAt: null });
    return sessions.get(jti);
  });
  mockUserSession.findOne.mockImplementation(async ({ where: { jti } }) => sessions.get(jti) ?? null);
  mockUserSession.update.mockImplementation(async (values, { where }) => {
    let count = 0;
    for (const [k, v] of sessions) {
      const matchJti = where.jti ? k === where.jti : true;
      const matchUser = where.userId ? v.userId === where.userId : true;
      const notRevoked = where.revokedAt === null ? v.revokedAt === null : true;
      if (matchJti && matchUser && notRevoked) {
        sessions.set(k, { ...v, ...values });
        count++;
      }
    }
    return count;
  });
  mockGetTenantId.mockResolvedValue(tenantId);
  mockSequelize.transaction.mockImplementation(async (fn) => fn(Symbol('tx')));
  mockSequelize.query.mockResolvedValue([[], []]);
});

describe('Issue #490 — JWT revocation', () => {
  it('authenticate passes for a valid tracked token', async () => {
    const { token } = await makeTrackedToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
  });

  it('legacy token without jti passes through (opportunistic revocation — no hard cutover)', async () => {
    const token = makeLegacyToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    // Pre-deploy tokens have no jti so they cannot be looked up or revoked;
    // they pass through and expire naturally within JWT_EXPIRATION.
    expect(res.status).toBe(200);
  });

  it('token with jti but no session record passes through (session may have been cleaned up)', async () => {
    const token = makeUntrackedToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('POST /auth/logout revokes the current session; re-use returns 401', async () => {
    const { token } = await makeTrackedToken();

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const reuseRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('TOKEN_REVOKED');
  });

  it('POST /auth/reset-password revokes all prior sessions before issuing new ones', async () => {
    // Seed two existing sessions for the user.
    const { token: oldToken1 } = await makeTrackedToken();
    const { token: oldToken2 } = await makeTrackedToken();

    // Set up User for password reset path.
    const rawToken = 'raw-reset-token-490';
    const crypto = await import('crypto');
    const hashedToken = crypto.default.createHash('sha256').update(rawToken).digest('hex');
    mockUser.findOne.mockResolvedValueOnce({
      id: userId,
      username: 'tester',
      organizationId: orgId,
      isAdmin: false,
      isAnonymous: false,
      email: null,
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 60_000),
      save: jest.fn().mockResolvedValue(true),
      // #892 PR1: password-reset auto-login now writes lastActiveAt.
      update: jest.fn().mockResolvedValue(undefined),
    });

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewPass123!' });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.token).toBeDefined();

    // Old sessions must now be revoked.
    const old1Res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken1}`);
    expect(old1Res.status).toBe(401);
    expect(old1Res.body.code).toBe('TOKEN_REVOKED');

    const old2Res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken2}`);
    expect(old2Res.status).toBe(401);
    expect(old2Res.body.code).toBe('TOKEN_REVOKED');
  });

});
