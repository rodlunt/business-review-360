/**
 * Tests for HTTP layer of /api/users routes:
 *   GET    /api/users           (list)
 *   GET    /api/users/profile   (own profile)
 *   PATCH  /api/users/:id/admin (role change)
 *   PATCH  /api/users/:id/email (email update)
 *   POST   /api/users/:id/approve
 *   DELETE /api/users/:id
 *
 * Key harness differences from ideasBatch.test.js:
 *
 *  1. User IDs are UUIDs (not integers) because userService.js calls
 *     isValidUUID() on every :id param and User.findByPk(uuid) on targets.
 *
 *  2. testUsers entries are Sequelize model instances (from User.create) so
 *     that spy-intercepted findByPk calls return instances with .save() and
 *     .destroy() wired to the SQLite DB.
 *
 *  3. auditLog is fully mocked (auditLogger middleware calls AuditLog.create
 *     which uses platformSequelize with Postgres-only ::jsonb casts).
 *
 *  4. notificationEmailService is mocked for approveUser / triggerPasswordReset.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Organization from '../../backend/src/models/Organization.js';

const Sequelize = User.sequelize.constructor;

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  logAuditEvent: jest.fn(async () => {}),
  AuditLog: { create: jest.fn(async () => ({})) },
  auditLogger: () => (_req, _res, next) => next(),
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
}));

// listUsers now queries UserOrganizationMembership; mock it so tests using the
// SQLite harness (which has no UserOrganizationMemberships table) don't error.
const mockUOM = {
  findAll: jest.fn(() => Promise.resolve([])),
  findOne: jest.fn(() => Promise.resolve(null)),
  create: jest.fn(() => Promise.resolve({})),
  update: jest.fn(() => Promise.resolve([1])),
  destroy: jest.fn(() => Promise.resolve(0)),
};
jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: mockUOM,
}));

jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendUserAccountApprovedEmail: jest.fn(async () => {}),
  sendPasswordResetEmail: jest.fn(async () => {}),
  sendAccountSetupEmail: jest.fn(async () => {}),
  sendWelcomeEmail: jest.fn(async () => {}),
  sendVerificationEmail: jest.fn(async () => {}),
  sendPasswordChangedEmail: jest.fn(async () => {}),
  sendAdminUserPendingApprovalEmail: jest.fn(async () => {}),
  sendStatusChangeEmail: jest.fn(async () => {}),
  sendIdeaImplementedEmail: jest.fn(async () => {}),
  sendNewIdeaSubmittedEmail: jest.fn(async () => {}),
  sendCommentOnIdeaEmail: jest.fn(async () => {}),
  sendCommentReplyEmail: jest.fn(async () => {}),
  sendIdeasNeedAttentionEmail: jest.fn(async () => {}),
  sendDailyIdeaDigestEmail: jest.fn(async () => {}),
  sendTeamInviteEmail: jest.fn(async () => {}),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-users-routes-tests';

const org1Handle = 'users-org-one';
const org2Handle = 'users-org-two';

// UUID IDs required: userService.js calls isValidUUID() on req.params.id
const adminId   = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const regularId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const org2UserId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';

const adminToken = jwt.sign(
  { id: adminId, username: 'usersadmin', isAdmin: true, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'usersregular', isAdmin: false, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// testUsers: UUID -> Sequelize instance (set during beforeEach)
const testUsers = {};
jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: usersRoutes } = await import('../../backend/src/routes/users.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let sequelize;
let app;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

  User.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      username: { type: Sequelize.STRING },
      email: { type: Sequelize.STRING },
      passwordHash: { type: Sequelize.STRING },
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      isAnonymous: { type: Sequelize.BOOLEAN, defaultValue: false },
      isApproved: { type: Sequelize.BOOLEAN, defaultValue: true },
      organizationId: { type: Sequelize.STRING },
      tenant_id: { type: Sequelize.UUID },
      // Step-position resume (#walkthrough-step-resume): mirrors the real
      // hasSeen*Walkthrough / *WalkthroughStep columns on User.js.
      hasSeenSuperuserWalkthrough: { type: Sequelize.BOOLEAN, defaultValue: false },
      hasSeenAdminWalkthrough: { type: Sequelize.BOOLEAN, defaultValue: false },
      hasSeenUserWalkthrough: { type: Sequelize.BOOLEAN, defaultValue: false },
      superuserWalkthroughStep: { type: Sequelize.INTEGER, allowNull: true },
      adminWalkthroughStep: { type: Sequelize.INTEGER, allowNull: true },
      userWalkthroughStep: { type: Sequelize.INTEGER, allowNull: true },
    },
    { sequelize, modelName: 'User', tableName: 'Users', timestamps: true }
  );

  Organization.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      organizationId: { type: Sequelize.STRING, unique: true, allowNull: false },
      organizationName: { type: Sequelize.STRING, allowNull: false },
    },
    { sequelize, modelName: 'Organization', tableName: 'Organizations' }
  );

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/users', authenticate, usersRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await User.destroy({ where: {}, truncate: true });
  await Organization.destroy({ where: {}, truncate: true });
  await Organization.create({ organizationId: org1Handle, organizationName: 'Users Org One' });
  await Organization.create({ organizationId: org2Handle, organizationName: 'Users Org Two' });

  // Create Sequelize instances so the findByPk spy returns objects that have
  // .save() and .destroy() wired to the SQLite DB.
  const adminUser = await User.create({
    id: adminId,
    username: 'usersadmin',
    email: 'usersadmin@test.com',
    isAdmin: true,
    isAnonymous: false,
    isApproved: true,
    organizationId: org1Handle,
  });

  const regularUser = await User.create({
    id: regularId,
    username: 'usersregular',
    email: 'usersregular@test.com',
    isAdmin: false,
    isAnonymous: false,
    isApproved: true,
    organizationId: org1Handle,
  });

  const org2User = await User.create({
    id: org2UserId,
    username: 'usersorg2',
    email: 'usersorg2@test.com',
    isAdmin: false,
    isAnonymous: false,
    isApproved: true,
    organizationId: org2Handle,
  });

  testUsers[adminId] = adminUser;
  testUsers[regularId] = regularUser;
  testUsers[org2UserId] = org2User;

  // listUsers queries membership table; return org1 members only
  mockUOM.findAll.mockImplementation(({ where } = {}) => {
    const orgId = where?.organizationId;
    if (orgId === org1Handle) {
      return Promise.resolve([
        { userId: adminId, isAdmin: true, isSuperuser: false, isApproved: true },
        { userId: regularId, isAdmin: false, isSuperuser: false, isApproved: true },
      ]);
    }
    return Promise.resolve([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------

describe('GET /api/users: list users', () => {
  it('returns 200 array of users in admin org when called by admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((u) => u.id);
    expect(ids).toContain(adminId);
    expect(ids).toContain(regularId);
  });

  it('returns only users from the caller org — not other orgs', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((u) => u.id);
    expect(ids).not.toContain(org2UserId);
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/profile
// ---------------------------------------------------------------------------

describe('GET /api/users/profile: own profile', () => {
  it('returns 200 with profile for the authenticated user', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminId);
    expect(res.body.username).toBe('usersadmin');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/admin
// ---------------------------------------------------------------------------

describe('PATCH /api/users/:id/admin: role changes', () => {
  it('returns 200 { success: true } when admin promotes a regular user to admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${regularId}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAdmin: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('persists the isAdmin=true change in the database', async () => {
    await request(app)
      .patch(`/api/users/${regularId}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAdmin: true });

    // Use findOne (not findByPk) to bypass the findByPk spy and query SQLite directly
    const reloaded = await User.findOne({ where: { id: regularId } });
    expect(reloaded.isAdmin).toBe(true);
  });

  it('returns 200 when admin demotes a user from admin to regular', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminId}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAdmin: false });

    expect(res.status).toBe(200);
  });

  it('returns 403 when non-admin attempts a role change', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminId}/admin`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ isAdmin: false });

    expect(res.status).toBe(403);
  });

  it('returns 404 when target userId does not exist', async () => {
    const res = await request(app)
      .patch('/api/users/00000000-0000-4000-8000-000000000099/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAdmin: true });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('returns 403 CROSS_ORG_FORBIDDEN when admin targets a user from another org', async () => {
    const res = await request(app)
      .patch(`/api/users/${org2UserId}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAdmin: true });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CROSS_ORG_FORBIDDEN');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .patch(`/api/users/${regularId}/admin`)
      .send({ isAdmin: true });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id/email
// ---------------------------------------------------------------------------

describe('PATCH /api/users/:id/email: email update', () => {
  it('returns 200 when admin updates a users email', async () => {
    const res = await request(app)
      .patch(`/api/users/${regularId}/email`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'newemail@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 EMAIL_REQUIRED when email field is missing', async () => {
    const res = await request(app)
      .patch(`/api/users/${regularId}/email`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_REQUIRED');
  });

  it('returns 400 EMAIL_INVALID for a malformed email', async () => {
    const res = await request(app)
      .patch(`/api/users/${regularId}/email`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMAIL_INVALID');
  });

  it('returns 409 EMAIL_CONFLICT when email is already used by another user', async () => {
    const res = await request(app)
      .patch(`/api/users/${regularId}/email`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'usersadmin@test.com' }); // admin's email

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_CONFLICT');
  });

  it('returns 403 when non-admin attempts email update', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminId}/email`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ email: 'hacked@example.com' });

    expect(res.status).toBe(403);
  });

  it('returns 403 CROSS_ORG_FORBIDDEN for cross-org email update', async () => {
    const res = await request(app)
      .patch(`/api/users/${org2UserId}/email`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'crossorg@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CROSS_ORG_FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/:id/approve
// ---------------------------------------------------------------------------

describe('POST /api/users/:id/approve: approve user', () => {
  it('returns 200 when admin approves a pending user', async () => {
    // Create a pending user
    const pendingUser = await User.create({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
      username: 'pending1',
      email: 'pending1@test.com',
      isAdmin: false,
      isApproved: false,
      organizationId: org1Handle,
    });
    testUsers[pendingUser.id] = pendingUser;

    const res = await request(app)
      .post(`/api/users/${pendingUser.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('sets isApproved=true in the database after approval', async () => {
    const pendingUser = await User.create({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
      username: 'pending2',
      email: 'pending2@test.com',
      isAdmin: false,
      isApproved: false,
      organizationId: org1Handle,
    });
    testUsers[pendingUser.id] = pendingUser;

    await request(app)
      .post(`/api/users/${pendingUser.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Use findOne (not findByPk) to bypass the spy and query SQLite directly
    const reloaded = await User.findOne({ where: { id: pendingUser.id } });
    expect(reloaded.isApproved).toBe(true);
  });

  it('returns 400 USER_ALREADY_APPROVED when user is already approved', async () => {
    const res = await request(app)
      .post(`/api/users/${regularId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_ALREADY_APPROVED');
  });

  it('returns 403 when non-admin attempts to approve', async () => {
    const res = await request(app)
      .post(`/api/users/${adminId}/approve`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/users/:id: deletion', () => {
  it('returns 200 { success: true } when admin deletes another user in the same org', async () => {
    const res = await request(app)
      .delete(`/api/users/${regularId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('removes the user row from the database after successful delete', async () => {
    await request(app)
      .delete(`/api/users/${regularId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Use findOne (not findByPk) to bypass the findByPk spy and query SQLite directly
    const gone = await User.findOne({ where: { id: regularId } });
    expect(gone).toBeNull();
  });

  it('returns 400 USER_SELF_DELETE when admin tries to delete their own account', async () => {
    const res = await request(app)
      .delete(`/api/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('USER_SELF_DELETE');
  });

  it('returns 403 when non-admin attempts to delete a user', async () => {
    const res = await request(app)
      .delete(`/api/users/${adminId}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 USER_NOT_FOUND when target user does not exist', async () => {
    const res = await request(app)
      .delete('/api/users/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('returns 403 CROSS_ORG_FORBIDDEN when admin targets a user from another org', async () => {
    const res = await request(app)
      .delete(`/api/users/${org2UserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CROSS_ORG_FORBIDDEN');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).delete(`/api/users/${regularId}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/walkthrough: step-position resume
// ---------------------------------------------------------------------------

describe('PATCH /api/users/walkthrough: step-position resume', () => {
  it('persists the step and marks the tour seen when a step is supplied', async () => {
    const res = await request(app)
      .patch('/api/users/walkthrough')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ type: 'admin', step: 3 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Use findOne (not findByPk) to bypass the findByPk spy and query SQLite directly
    const reloaded = await User.findOne({ where: { id: regularId } });
    expect(reloaded.adminWalkthroughStep).toBe(3);
    expect(reloaded.hasSeenAdminWalkthrough).toBe(true);
  });

  it('clears the saved step and marks the tour seen when no step is supplied (complete path)', async () => {
    // Seed a saved position, as if the user had previously dismissed the
    // tour mid-way, then completed it on this pass.
    await User.update({ adminWalkthroughStep: 3 }, { where: { id: regularId } });

    const res = await request(app)
      .patch('/api/users/walkthrough')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ type: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const reloaded = await User.findOne({ where: { id: regularId } });
    expect(reloaded.adminWalkthroughStep).toBeNull();
    expect(reloaded.hasSeenAdminWalkthrough).toBe(true);
  });

  it('returns 400 for a negative step', async () => {
    const res = await request(app)
      .patch('/api/users/walkthrough')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ type: 'admin', step: -1 });

    expect(res.status).toBe(400);
  });

  it('returns 400 for a step at or above the upper bound', async () => {
    const res = await request(app)
      .patch('/api/users/walkthrough')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ type: 'admin', step: 100 });

    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-integer step', async () => {
    const res = await request(app)
      .patch('/api/users/walkthrough')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ type: 'admin', step: 'x' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid walkthrough type', async () => {
    const res = await request(app)
      .patch('/api/users/walkthrough')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ type: 'bogus', step: 1 });

    expect(res.status).toBe(400);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).patch('/api/users/walkthrough').send({ type: 'admin' });
    expect(res.status).toBe(401);
  });
});
