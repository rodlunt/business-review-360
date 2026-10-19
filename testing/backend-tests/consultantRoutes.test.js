/**
 * Consultant onboarding routes — Issue #821 smoke coverage.
 *
 * Covers all routes in backend/src/routes/consultants.js:
 *   - GET  /validate-code/:code  (public — referral code validation)
 *   - GET  /invite/:token        (public — invite lookup for signup prefill)
 *   - POST /signup               (public — complete consultant profile from invite)
 *   - POST /invite               (protected, superuser — create and send invite)
 *   - GET  /                     (protected, superuser — list consultants)
 *   - PATCH /:id                 (protected, superuser — update commission/active)
 *
 * Auth notes:
 *   - JWTs carry no jti so authenticate skips the UserSession revocation lookup.
 *   - User.findByPk is spied to return test fixtures without a real DB query.
 *   - UserOrganizationMembership is mocked; the multi-org branch in authenticate
 *     is not triggered because activeOrgId === homeOrgId in all test tokens.
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'sqlite::memory:';
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || 'sqlite::memory:';

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { allEmailTemplatesMock } from '../test-fixtures/email-template-mocks.js';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any dynamic route import
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn(),
  AuditLog: { create: jest.fn() },
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
  default: {},
}));

const mockConsultant = {
  findOne: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findByPk: jest.fn(),
};
jest.unstable_mockModule('../../backend/src/models/Consultant.js', () => ({
  default: mockConsultant,
}));

const mockConsultantInvite = {
  findOne: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
};
jest.unstable_mockModule('../../backend/src/models/ConsultantInvite.js', () => ({
  default: mockConsultantInvite,
}));

jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: {
    create: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

const sendTemplateEmailMock = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: sendTemplateEmailMock,
  buildFromHeader: jest.fn(),
}));

const getTenantIdMock = jest.fn().mockResolvedValue(null);
jest.unstable_mockModule('../../backend/src/middleware/tenantResolver.js', () => ({
  getTenantId: getTenantIdMock,
  resolveTenant: (_req, _res, next) => next(),
}));

const withTenantContextMock = jest.fn().mockImplementation((_tenantId, fn) => fn());
jest.unstable_mockModule('../../backend/src/utils/withTenantContext.js', () => ({
  withTenantContext: withTenantContextMock,
}));

// All *.jsx paths share one module slot via moduleNameMapper.
jest.unstable_mockModule(
  '../../backend/src/emails/templates/consultants/ConsultantInviteEmail.jsx',
  allEmailTemplatesMock,
);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import User from '../../backend/src/models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-consultant-routes-821';
process.env.JWT_SECRET = JWT_SECRET;

const superuserId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const regularUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';

const superuserToken = jwt.sign(
  { id: superuserId, organizationId: 'admin-org' },
  JWT_SECRET,
  { expiresIn: '1h' },
);

const regularToken = jwt.sign(
  { id: regularUserId, organizationId: 'admin-org' },
  JWT_SECRET,
  { expiresIn: '1h' },
);

// Consultant management is gated by requirePlatformOwner (id === PLATFORM_OWNER_ID),
// NOT by superuser. The owner is intentionally NOT a superuser here to prove the
// gate is purely id-based and a superuser who is not the owner is denied.
const platformOwnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';
process.env.PLATFORM_OWNER_ID = platformOwnerId;

const platformOwnerToken = jwt.sign(
  { id: platformOwnerId, organizationId: 'admin-org' },
  JWT_SECRET,
  { expiresIn: '1h' },
);

const testUsers = {
  [superuserId]: { id: superuserId, username: 'superuser', isAdmin: true, isSuperuser: true, organizationId: 'admin-org' },
  [regularUserId]: { id: regularUserId, username: 'regular', isAdmin: false, isSuperuser: false, organizationId: 'admin-org' },
  [platformOwnerId]: { id: platformOwnerId, username: 'owner', isAdmin: false, isSuperuser: false, organizationId: 'admin-org' },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] ?? null);

// Routes and middleware imported dynamically so mocks are in place first.
const { publicRouter, protectedRouter } = await import('../../backend/src/routes/consultants.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

// Valid Australian ABN (passes the official checksum: sum % 89 === 0).
const VALID_ABN = '51 824 753 556';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/consultants', publicRouter);
  app.use('/api/consultants', authenticate, protectedRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/consultants/validate-code/:code', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    mockConsultant.findOne.mockReset();
  });

  it('returns valid:true with consultant details for an active code', async () => {
    mockConsultant.findOne.mockResolvedValue({
      firstName: 'Jane',
      lastName: 'Smith',
      companyName: 'Acme Consulting',
    });

    const res = await request(app).get('/api/consultants/validate-code/acme-1234');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      consultantName: 'Jane Smith',
      companyName: 'Acme Consulting',
    });
  });

  it('returns valid:false when code does not match an active consultant', async () => {
    mockConsultant.findOne.mockResolvedValue(null);

    const res = await request(app).get('/api/consultants/validate-code/unknown-9999');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false });
  });

  it('returns valid:false (never 404) even on DB error — avoids enumeration', async () => {
    mockConsultant.findOne.mockRejectedValue(new Error('DB down'));

    const res = await request(app).get('/api/consultants/validate-code/any-code');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false });
  });
});

describe('GET /api/consultants/invite/:token', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    mockConsultantInvite.findOne.mockReset();
  });

  it('returns invite details for a valid pending token', async () => {
    mockConsultantInvite.findOne.mockResolvedValue({
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      commissionRate: '0.3000',
      isExpired: () => false,
    });

    const res = await request(app).get('/api/consultants/invite/valid-uuid-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      commissionRate: 0.3,
    });
  });

  it('returns 404 when token is not in the database', async () => {
    mockConsultantInvite.findOne.mockResolvedValue(null);

    const res = await request(app).get('/api/consultants/invite/no-such-token');

    expect(res.status).toBe(404);
  });

  it('returns 410 for an expired or already-used invite', async () => {
    mockConsultantInvite.findOne.mockResolvedValue({
      isExpired: () => true,
    });

    const res = await request(app).get('/api/consultants/invite/expired-token');

    expect(res.status).toBe(410);
  });
});

describe('POST /api/consultants/signup', () => {
  let app;

  const pendingInvite = {
    id: 'invite-uuid-1',
    token: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000010',
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Smith',
    commissionRate: '0.3000',
  };

  beforeEach(() => {
    app = buildApp();
    mockConsultantInvite.findOne.mockReset();
    mockConsultantInvite.update.mockReset();
    mockConsultant.findOne.mockReset();
    mockConsultant.create.mockReset();
    sendTemplateEmailMock.mockReset();
    sendTemplateEmailMock.mockResolvedValue({});
    // Default: getTenantId returns null so demo account block is skipped.
    getTenantIdMock.mockResolvedValue(null);
  });

  it('creates consultant, skips demo account when tenant not found, sends welcome email', async () => {
    mockConsultantInvite.findOne.mockResolvedValue(pendingInvite);
    mockConsultantInvite.update.mockResolvedValue([1]);
    mockConsultant.findOne.mockResolvedValue(null);
    mockConsultant.create.mockResolvedValue({
      id: 'consultant-uuid-1',
      referralCode: 'jane-1234',
    });

    const res = await request(app)
      .post('/api/consultants/signup')
      .send({ token: pendingInvite.token, abn: VALID_ABN, companyName: 'Jane Consulting' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('referralCode');
    expect(res.body).toHaveProperty('referralUrl');
    expect(res.body.referralUrl).toContain('/register?ref=');
    expect(mockConsultant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Jane',
        lastName: 'Smith',
        companyName: 'Jane Consulting',
        isActive: true,
      }),
    );
    expect(sendTemplateEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jane@example.com',
        categories: expect.arrayContaining(['consultant-welcome']),
      }),
    );
  });

  it('creates a demo account when tenant is resolved', async () => {
    mockConsultantInvite.findOne.mockResolvedValue(pendingInvite);
    mockConsultantInvite.update.mockResolvedValue([1]);
    mockConsultant.findOne.mockResolvedValue(null);
    mockConsultant.create.mockResolvedValue({ id: 'c1', referralCode: 'jane-5678' });
    getTenantIdMock.mockResolvedValue('demo-corp-tenant-id');

    // Mock User.findOne and User.create for the demo account path.
    const findOneSpy = jest.spyOn(User, 'findOne').mockResolvedValueOnce(null);
    const createSpy = jest.spyOn(User, 'create').mockResolvedValueOnce({ id: 'demo-user-uuid' });

    const res = await request(app)
      .post('/api/consultants/signup')
      .send({ token: pendingInvite.token, abn: VALID_ABN });

    expect(res.status).toBe(201);
    expect(withTenantContextMock).toHaveBeenCalledWith('demo-corp-tenant-id', expect.any(Function));
    expect(findOneSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'jane@example.com',
        isAdmin: true,
        isApproved: true,
        organizationId: 'demo-corp',
      }),
    );

    findOneSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('returns 410 when the atomic invite claim fails (race condition)', async () => {
    mockConsultantInvite.findOne.mockResolvedValue(pendingInvite);
    mockConsultantInvite.update.mockResolvedValue([0]);

    const res = await request(app)
      .post('/api/consultants/signup')
      .send({ token: pendingInvite.token, abn: VALID_ABN });

    expect(res.status).toBe(410);
    expect(mockConsultant.create).not.toHaveBeenCalled();
  });

  it('returns 409 when a custom referral code is already taken', async () => {
    mockConsultantInvite.findOne.mockResolvedValue(pendingInvite);
    mockConsultantInvite.update.mockResolvedValue([1]);
    mockConsultant.findOne.mockResolvedValue({ referralCode: 'taken-code' });

    const res = await request(app)
      .post('/api/consultants/signup')
      .send({ token: pendingInvite.token, abn: VALID_ABN, referralCode: 'taken-code' });

    expect(res.status).toBe(409);
  });

  it('returns 400 for an invalid ABN (checksum fails)', async () => {
    const res = await request(app)
      .post('/api/consultants/signup')
      .send({ token: pendingInvite.token, abn: '12345678901' });

    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('abn');
  });

  it('returns 400 when token is not a valid UUID', async () => {
    const res = await request(app)
      .post('/api/consultants/signup')
      .send({ token: 'not-a-uuid', abn: VALID_ABN });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/consultants/invite (platform owner only)', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    mockConsultantInvite.create.mockReset();
    sendTemplateEmailMock.mockReset();
    sendTemplateEmailMock.mockResolvedValue({});
  });

  it('creates invite and dispatches invite email as the platform owner', async () => {
    mockConsultantInvite.create.mockResolvedValue({
      id: 'invite-uuid-new',
      token: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      email: 'bob@example.com',
      firstName: 'Bob',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await request(app)
      .post('/api/consultants/invite')
      .set('Authorization', `Bearer ${platformOwnerToken}`)
      .send({ email: 'bob@example.com', firstName: 'Bob', lastName: 'Jones' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.email).toBe('bob@example.com');
    expect(sendTemplateEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
        categories: expect.arrayContaining(['consultant-invite']),
      }),
    );
  });

  it('returns 403 for a regular authenticated user (not the owner)', async () => {
    const res = await request(app)
      .post('/api/consultants/invite')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ email: 'x@example.com', firstName: 'X', lastName: 'Y' });

    expect(res.status).toBe(403);
  });

  it('returns 403 for a superuser who is not the platform owner', async () => {
    const res = await request(app)
      .post('/api/consultants/invite')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({ email: 'x@example.com', firstName: 'X', lastName: 'Y' });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/consultants/invite')
      .send({ email: 'x@example.com', firstName: 'X', lastName: 'Y' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/consultants/invite')
      .set('Authorization', `Bearer ${platformOwnerToken}`)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/consultants (platform owner only)', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    mockConsultant.findAll.mockReset();
  });

  it('returns consultant list for the platform owner', async () => {
    mockConsultant.findAll.mockResolvedValue([
      { id: 'c1', firstName: 'Alice', lastName: 'Wonder', referralCode: 'alice-1234', commissionRate: 0.3, isActive: true },
      { id: 'c2', firstName: 'Bob', lastName: 'Builder', referralCode: 'bob-5678', commissionRate: 0.25, isActive: false },
    ]);

    const res = await request(app)
      .get('/api/consultants')
      .set('Authorization', `Bearer ${platformOwnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].referralCode).toBe('alice-1234');
  });

  it('returns 403 for a regular user (not the owner)', async () => {
    const res = await request(app)
      .get('/api/consultants')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a superuser who is not the platform owner', async () => {
    const res = await request(app)
      .get('/api/consultants')
      .set('Authorization', `Bearer ${superuserToken}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/consultants/:id (platform owner only)', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    mockConsultant.findByPk.mockReset();
  });

  it('updates commissionRate for an existing consultant', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    mockConsultant.findByPk.mockResolvedValue({
      id: 'c1',
      referralCode: 'alice-1234',
      commissionRate: 0.25,
      isActive: true,
      update: updateMock,
    });

    const res = await request(app)
      .patch('/api/consultants/c1')
      .set('Authorization', `Bearer ${platformOwnerToken}`)
      .send({ commissionRate: 0.25 });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ commissionRate: 0.25 });
  });

  it('updates isActive flag', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    mockConsultant.findByPk.mockResolvedValue({
      id: 'c1',
      referralCode: 'alice-1234',
      commissionRate: 0.3,
      isActive: false,
      update: updateMock,
    });

    const res = await request(app)
      .patch('/api/consultants/c1')
      .set('Authorization', `Bearer ${platformOwnerToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ isActive: false });
  });

  it('returns 404 when consultant id does not exist', async () => {
    mockConsultant.findByPk.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/consultants/nonexistent-id')
      .set('Authorization', `Bearer ${platformOwnerToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid commissionRate (out of 0-1 range)', async () => {
    const res = await request(app)
      .patch('/api/consultants/c1')
      .set('Authorization', `Bearer ${platformOwnerToken}`)
      .send({ commissionRate: 1.5 });

    expect(res.status).toBe(400);
  });

  it('returns 403 for a superuser who is not the platform owner', async () => {
    const res = await request(app)
      .patch('/api/consultants/c1')
      .set('Authorization', `Bearer ${superuserToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });
});
