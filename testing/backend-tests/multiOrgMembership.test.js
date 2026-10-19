/**
 * Issue #811 -- multi-org membership CRUD
 *
 * Proves that UserOrganizationMembership works correctly for the three
 * scenarios that multi-org support must handle:
 *
 *   1. A user added to a second org appears in GET /users for that org.
 *   2. DELETE /:id/org-membership removes the membership row without
 *      deleting the User account.
 *   3. A user whose JWT claims org-A cannot call GET /users for org-B
 *      (cross-org isolation enforced in listUsers).
 *
 * Uses SQLite in-memory DB so Postgres RLS is absent. Any cross-tenant
 * leak that succeeds here is a route/service layer failure, not an RLS
 * misconfiguration.
 *
 * Auth is mocked via jest.unstable_mockModule so the tests control
 * req.user directly without needing real JWTs or a UserSessions table.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Auth mock -- registered BEFORE any route or model imports that pull in
// auth.js transitively. The mock controls the active user's org and role.
// ---------------------------------------------------------------------------

let authBehaviour = {
  mode: 'allow',
  userId: 'platform-owner-uuid',
  organizationId: 'org-alpha',
  isAdmin: true,
  isSuperuser: true,
};

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => {
    if (authBehaviour.mode === 'reject') {
      return _res.status(401).json({ error: 'No token provided' });
    }
    req.user = {
      id: authBehaviour.userId,
      username: 'testuser',
      organizationId: authBehaviour.organizationId,
      isAdmin: authBehaviour.isAdmin,
      isSuperuser: authBehaviour.isSuperuser ?? authBehaviour.isAdmin,
      isApproved: true,
      isAnonymous: false,
      tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
  },
  requireSuperuser: (req, res, next) => {
    if (!req.user?.isSuperuser) return res.status(403).json({ error: 'Superuser access required' });
    next();
  },
  // requirePlatformOwner is used by add-to-org and remove-from-org routes.
  // The mock allows through when mode is 'allow'.
  requirePlatformOwner: (req, res, next) => {
    if (authBehaviour.mode === 'reject-platform-owner') {
      return res.status(403).json({ error: 'Platform owner access required' });
    }
    next();
  },
  generateToken: jest.fn(),
}));

// Suppress audit log DB writes during tests.
jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  redactForAudit: (obj) => obj,
}));

// Suppress logger output so test output stays clean.
jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// SQLite in-memory DB setup.
// We re-initialise only the models needed by the users route: User and
// UserOrganizationMembership. Re-init uses the same Sequelize instance the
// production models are bound to so associations and the module cache stay
// consistent within Jest experimental-vm-modules.
// ---------------------------------------------------------------------------

import User from '../../backend/src/models/User.js';
import UserOrganizationMembership from '../../backend/src/models/UserOrganizationMembership.js';

// Grab the Sequelize constructor from the already-bound model so we don't
// create a second class identity (issue #670 root cause).
const Sequelize = User.sequelize.constructor;

// UUIDs for the two test organisations and the test users.
const ORG_ALPHA = 'org-alpha';
const ORG_BETA = 'org-beta';

const PLATFORM_OWNER_UUID = '00000000-0000-0000-0000-000000000001';
const USER_ALPHA_UUID = '00000000-0000-0000-0000-000000000002';
const USER_BETA_UUID = '00000000-0000-0000-0000-000000000003';
const USER_CROSS_UUID = '00000000-0000-0000-0000-000000000004';

let sequelize;
let app;
let usersRouter;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

  // Re-initialise User against the test SQLite instance.
  User.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      username: { type: Sequelize.STRING, allowNull: false, unique: true },
      passwordHash: { type: Sequelize.STRING, allowNull: true },
      email: { type: Sequelize.STRING, allowNull: true },
      isAnonymous: { type: Sequelize.BOOLEAN, defaultValue: false },
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      isSuperuser: { type: Sequelize.BOOLEAN, defaultValue: false },
      isApproved: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      organizationId: { type: Sequelize.STRING, allowNull: true },
      tenant_id: { type: Sequelize.UUID, allowNull: false },
    },
    {
      sequelize,
      modelName: 'Users',
      tableName: 'Users',
      timestamps: true,
      hooks: {
        // Disable the immutable-organizationId hook in tests; we set it at create time.
        beforeUpdate: () => {},
      },
    }
  );

  // Re-initialise UserOrganizationMembership against the test SQLite instance.
  UserOrganizationMembership.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      userId: { type: Sequelize.UUID, allowNull: false },
      organizationId: { type: Sequelize.STRING, allowNull: false },
      isAdmin: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      isApproved: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      isSuperuser: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      modelName: 'UserOrganizationMembership',
      tableName: 'UserOrganizationMemberships',
      timestamps: true,
      updatedAt: false,
      createdAt: 'createdAt',
    }
  );

  await sequelize.sync();

  // Import the users router after mocks and models are ready.
  const mod = await import('../../backend/src/routes/users.js');
  usersRouter = mod.default;

  const { authenticate, requireAdmin } = await import('../../backend/src/middleware/auth.js');

  app = express();
  app.use(express.json());
  app.use('/api/users', authenticate, requireAdmin, usersRouter);
});

afterAll(async () => {
  await sequelize.close();
});

// ---------------------------------------------------------------------------
// Reset DB rows between tests for isolation.
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await UserOrganizationMembership.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  // Seed the platform owner user (used to exercise add-to-org).
  await User.create({
    id: PLATFORM_OWNER_UUID,
    username: 'platform-owner',
    passwordHash: 'x',
    email: 'owner@test.invalid',
    organizationId: ORG_ALPHA,
    tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    isAdmin: true,
    isSuperuser: true,
    isApproved: true,
  });

  // Seed a home user for org-alpha.
  await User.create({
    id: USER_ALPHA_UUID,
    username: 'alpha-user',
    passwordHash: 'x',
    email: 'alpha@test.invalid',
    organizationId: ORG_ALPHA,
    tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    isAdmin: false,
    isApproved: true,
  });

  // Seed a home user for org-beta.
  await User.create({
    id: USER_BETA_UUID,
    username: 'beta-user',
    passwordHash: 'x',
    email: 'beta@test.invalid',
    organizationId: ORG_BETA,
    tenant_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    isAdmin: false,
    isApproved: true,
  });

  // Seed the cross-org user whose home org is org-alpha.
  await User.create({
    id: USER_CROSS_UUID,
    username: 'cross-user',
    passwordHash: 'x',
    email: 'cross@test.invalid',
    organizationId: ORG_ALPHA,
    tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    isAdmin: false,
    isApproved: true,
  });

  // Seed the home membership for alpha-user in org-alpha.
  await UserOrganizationMembership.create({
    userId: USER_ALPHA_UUID,
    organizationId: ORG_ALPHA,
    isAdmin: false,
    isSuperuser: false,
    isApproved: true,
  });

  // Seed the home membership for beta-user in org-beta.
  await UserOrganizationMembership.create({
    userId: USER_BETA_UUID,
    organizationId: ORG_BETA,
    isAdmin: false,
    isSuperuser: false,
    isApproved: true,
  });

  // Reset auth behaviour to the default (admin in org-alpha).
  authBehaviour = {
    mode: 'allow',
    userId: PLATFORM_OWNER_UUID,
    organizationId: ORG_ALPHA,
    isAdmin: true,
    isSuperuser: true,
  };
});

// ---------------------------------------------------------------------------
// Test 1: user added to a second org via add-to-org appears in GET /users
// ---------------------------------------------------------------------------

describe('Issue #811 -- add-to-org then list', () => {
  it('cross-org user appears in GET /users for the second org after being added', async () => {
    // Add cross-user (home: org-alpha) to org-beta as a regular member.
    // The route is guarded by requirePlatformOwner; the mock allows through.
    // We act as the org-beta admin for the add step.
    authBehaviour = {
      mode: 'allow',
      userId: PLATFORM_OWNER_UUID,
      organizationId: ORG_BETA,
      isAdmin: true,
      isSuperuser: true,
    };

    const addRes = await request(app)
      .post('/api/users/add-to-org')
      .set('Authorization', 'Bearer fake')
      .send({ identifier: USER_CROSS_UUID, isAdmin: false });

    expect(addRes.status).toBe(201);
    expect(addRes.body.success).toBe(true);
    expect(addRes.body.user.username).toBe('cross-user');

    // Now list org-beta users as the org-beta admin.
    const listRes = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer fake');

    expect(listRes.status).toBe(200);
    const names = listRes.body.map((u) => u.username);
    expect(names).toContain('cross-user');
    expect(names).toContain('beta-user');

    // The cross-org member's isHomeOrg flag must be false because their
    // home org is org-alpha, not org-beta.
    const crossEntry = listRes.body.find((u) => u.username === 'cross-user');
    expect(crossEntry.isHomeOrg).toBe(false);
  });

  it('membership row is created in UserOrganizationMemberships', async () => {
    authBehaviour = {
      mode: 'allow',
      userId: PLATFORM_OWNER_UUID,
      organizationId: ORG_BETA,
      isAdmin: true,
      isSuperuser: true,
    };

    await request(app)
      .post('/api/users/add-to-org')
      .set('Authorization', 'Bearer fake')
      .send({ identifier: USER_CROSS_UUID, isAdmin: false });

    // Use findOne not findByPk to bypass the test-harness spy (CLAUDE.md convention).
    const membership = await UserOrganizationMembership.findOne({
      where: { userId: USER_CROSS_UUID, organizationId: ORG_BETA },
    });

    expect(membership).not.toBeNull();
    expect(membership.isAdmin).toBe(false);
    expect(membership.isApproved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 2: DELETE /:id/org-membership removes membership without deleting User
// ---------------------------------------------------------------------------

describe('Issue #811 -- remove-from-org', () => {
  it('removes the membership row but leaves the User account intact', async () => {
    // First add cross-user to org-beta so there is a row to delete.
    authBehaviour = {
      mode: 'allow',
      userId: PLATFORM_OWNER_UUID,
      organizationId: ORG_BETA,
      isAdmin: true,
      isSuperuser: true,
    };

    await request(app)
      .post('/api/users/add-to-org')
      .set('Authorization', 'Bearer fake')
      .send({ identifier: USER_CROSS_UUID });

    // Confirm membership exists.
    const before = await UserOrganizationMembership.findOne({
      where: { userId: USER_CROSS_UUID, organizationId: ORG_BETA },
    });
    expect(before).not.toBeNull();

    // Remove the membership (from org-beta context, as a different user so
    // the self-removal guard does not fire).
    const deleteRes = await request(app)
      .delete(`/api/users/${USER_CROSS_UUID}/org-membership`)
      .set('Authorization', 'Bearer fake');

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Membership row must be gone.
    const after = await UserOrganizationMembership.findOne({
      where: { userId: USER_CROSS_UUID, organizationId: ORG_BETA },
    });
    expect(after).toBeNull();

    // User account must still exist (findOne bypasses the findByPk spy).
    const userStillExists = await User.findOne({ where: { id: USER_CROSS_UUID } });
    expect(userStillExists).not.toBeNull();
    expect(userStillExists.username).toBe('cross-user');
  });

  it('returns 404 when the user is not a member of the org', async () => {
    // cross-user has never been added to org-beta in this test run.
    authBehaviour = {
      mode: 'allow',
      userId: PLATFORM_OWNER_UUID,
      organizationId: ORG_BETA,
      isAdmin: true,
      isSuperuser: true,
    };

    const res = await request(app)
      .delete(`/api/users/${USER_CROSS_UUID}/org-membership`)
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MEMBERSHIP_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Test 3: cross-org isolation on GET /users
// ---------------------------------------------------------------------------

describe('Issue #811 -- cross-org isolation on GET /users', () => {
  it('a user whose JWT claims org-alpha cannot see org-beta users', async () => {
    // Acting as an org-alpha admin; the listUsers service scopes the query to
    // req.user.organizationId (org-alpha) via membership lookup.
    authBehaviour = {
      mode: 'allow',
      userId: PLATFORM_OWNER_UUID,
      organizationId: ORG_ALPHA,
      isAdmin: true,
      isSuperuser: true,
    };

    // Add alpha-user membership to org-alpha so there is at least one result.
    // (Already seeded in beforeEach.)

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    const names = res.body.map((u) => u.username);

    // alpha-user is a member of org-alpha and should appear.
    expect(names).toContain('alpha-user');

    // beta-user is only a member of org-beta and must NOT appear.
    expect(names).not.toContain('beta-user');
  });

  it('org-beta admin only sees org-beta members in GET /users', async () => {
    // Seed beta admin membership in org-beta.
    await UserOrganizationMembership.create({
      userId: PLATFORM_OWNER_UUID,
      organizationId: ORG_BETA,
      isAdmin: true,
      isSuperuser: true,
      isApproved: true,
    });

    authBehaviour = {
      mode: 'allow',
      userId: PLATFORM_OWNER_UUID,
      organizationId: ORG_BETA,
      isAdmin: true,
      isSuperuser: true,
    };

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    const names = res.body.map((u) => u.username);

    // beta-user is a member of org-beta and should appear.
    expect(names).toContain('beta-user');

    // alpha-user is only a member of org-alpha and must NOT appear.
    expect(names).not.toContain('alpha-user');
  });
});
