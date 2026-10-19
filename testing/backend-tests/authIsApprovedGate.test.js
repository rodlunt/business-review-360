/**
 * isApproved gate regression guard.
 *
 * When an organisation disables self-registration, new users are created with
 * isApproved: false. Before this fix, /auth/login issued valid JWTs without
 * checking isApproved, allowing pending users to bypass the admin approval
 * gate entirely.
 *
 * This suite asserts that:
 *   - /auth/login returns 403 ACCOUNT_PENDING for an unapproved user whose
 *     credentials are otherwise valid.
 *   - /auth/login returns 200 / token payload for approved users.
 *   - generateToken is NOT called when the gate fires.
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
  create: jest.fn(),
  findByPk: jest.fn(),
};

const mockOrganization = {
  findOne: jest.fn(),
};

const mockPlatformSequelize = {
  query: jest.fn(),
};

const mockGetTenantId = jest.fn();
const mockGenerateToken = jest.fn(() => ({ token: 'access-token', jti: 'test-jti' }));
const mockCreateSession = jest.fn().mockResolvedValue({});

const mockUserOrganizationMembership = {
  findOne: jest.fn(),
};

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

// Mock bcrypt so compare always succeeds (we are testing the isApproved gate,
// not password hashing).
jest.unstable_mockModule('bcrypt', () => ({
  default: {
    compare: jest.fn().mockResolvedValue(true),
    hash: jest.fn().mockResolvedValue('$hashed$'),
  },
}));

const { publicRouter: authPublic, protectedRouter: authProtected } = await import('../../backend/src/routes/auth.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const { describe, it, expect, beforeEach } = await import('@jest/globals');
const request = (await import('supertest')).default;
const express = (await import('express')).default;

const app = express();
app.use(express.json());
app.use('/api/auth', authPublic);
app.use('/api/auth', authenticate, authProtected);

const unapprovedUser = {
  id: 'user-uuid-1',
  username: 'pendinguser',
  email: 'pending@example.com',
  passwordHash: '$2b$10$irrelevant',
  isAdmin: false,
  isAnonymous: false,
  isApproved: false,
  organizationId: orgId,
  // #892 PR1: every successful login path writes lastActiveAt via user.update.
  // Unapproved branch returns 403 before reaching the call; harmless here and
  // propagates via the spread into approvedUser, which DOES exercise it.
  update: jest.fn().mockResolvedValue(undefined),
};

const approvedUser = {
  ...unapprovedUser,
  id: 'user-uuid-2',
  username: 'approveduser',
  email: 'approved@example.com',
  isApproved: true,
};

beforeEach(() => {
  jest.clearAllMocks();

  mockSequelize.transaction.mockImplementation(async (fn) => fn(fakeTransaction));
  mockSequelize.query.mockResolvedValue([[], []]);

  mockGetTenantId.mockResolvedValue(tenantId);
  mockPlatformSequelize.query.mockResolvedValue([{ id: tenantId }]);
});

// ---------------------------------------------------------------------------
// /auth/login
// ---------------------------------------------------------------------------

describe('isApproved gate -- /auth/login', () => {
  it('returns 403 ACCOUNT_PENDING when user is unapproved', async () => {
    mockUser.findOne.mockResolvedValue(unapprovedUser);
    mockUserOrganizationMembership.findOne.mockResolvedValue({
      isAdmin: false, isApproved: false, isSuperuser: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pending@example.com', password: 'Password123!', organizationId: orgId });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_PENDING');
    expect(res.body.error).toMatch(/pending approval/i);
  });

  it('does NOT issue tokens when user is unapproved', async () => {
    mockUser.findOne.mockResolvedValue(unapprovedUser);
    mockUserOrganizationMembership.findOne.mockResolvedValue({
      isAdmin: false, isApproved: false, isSuperuser: false,
    });

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'pending@example.com', password: 'Password123!', organizationId: orgId });

    expect(mockGenerateToken).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('returns 200 with tokens when user is approved', async () => {
    mockUser.findOne.mockResolvedValue(approvedUser);
    mockUserOrganizationMembership.findOne.mockResolvedValue({
      isAdmin: false, isApproved: true, isSuperuser: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'approved@example.com', password: 'Password123!', organizationId: orgId });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe('access-token');
    expect(mockGenerateToken).toHaveBeenCalledTimes(1);
  });
});

