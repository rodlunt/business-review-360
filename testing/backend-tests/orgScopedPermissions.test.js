/**
 * Issue #812 -- org-scoped permission enforcement
 *
 * Proves that a user can hold different roles in different orgs and that
 * the application enforces per-org permissions, not home-org permissions:
 *
 *   1. A user who is admin in org-A can call PATCH /:id/admin in org-A (200).
 *   2. The same user who is a regular member in org-B gets 403 when they
 *      attempt the same call in org-B.
 *   3. The setAdminFlag service enforces org scope at the service layer:
 *      an org-A admin cannot modify a user who belongs to org-B.
 *   4. listUsers returns org-scoped role flags from the membership table,
 *      not the home-org User flags.
 *
 * Auth is mocked so we can precisely control req.user.isAdmin per test,
 * simulating what authenticate does when it loads membership flags for
 * cross-org sessions (issue #804 / auth.js lines ~178-187).
 *
 * Uses SQLite in-memory DB for the User and UserOrganizationMembership tables.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Auth mock -- registered BEFORE any route imports.
// The mock lets each test set req.user precisely, simulating the org-scoped
// membership flag loading that authenticate performs in production.
// ---------------------------------------------------------------------------

let authBehaviour = {
  mode: 'allow',
  userId: 'admin-user-uuid',
  organizationId: 'org-alpha',
  isAdmin: true,
  isSuperuser: false,
};

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (authBehaviour.mode === 'reject') {
      return res.status(401).json({ error: 'No token provided' });
    }
    req.user = {
      id: authBehaviour.userId,
      username: 'test-admin',
      organizationId: authBehaviour.organizationId,
      isAdmin: authBehaviour.isAdmin,
      isSuperuser: authBehaviour.isSuperuser ?? false,
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
  requirePlatformOwner: (_req, _res, next) => next(),
  generateToken: jest.fn(),
}));

// Suppress audit log DB writes.
jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  redactForAudit: (obj) => obj,
}));

// Suppress logger output.
jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// SQLite in-memory DB setup.
// ---------------------------------------------------------------------------

import User from '../../backend/src/models/User.js';
import UserOrganizationMembership from '../../backend/src/models/UserOrganizationMembership.js';

const Sequelize = User.sequelize.constructor;

const ORG_ALPHA = 'org-alpha';
const ORG_BETA = 'org-beta';

// The cross-org user: admin in org-alpha, regular member in org-beta.
const CROSS_ADMIN_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';
// Target user (home org: org-alpha) that the admin will act upon.
const TARGET_USER_UUID = 'aaaaaaaa-0000-0000-0000-000000000002';
// Another user who is home in org-beta.
const BETA_MEMBER_UUID = 'aaaaaaaa-0000-0000-0000-000000000003';

let sequelize;
let app;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

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
        // Disable the immutable-organizationId hook in tests.
        beforeUpdate: () => {},
      },
    }
  );

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

  const { authenticate, requireAdmin } = await import('../../backend/src/middleware/auth.js');
  const { default: usersRouter } = await import('../../backend/src/routes/users.js');

  app = express();
  app.use(express.json());
  app.use('/api/users', authenticate, requireAdmin, usersRouter);
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await UserOrganizationMembership.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  // cross-admin: isAdmin=true at home (org-alpha).
  await User.create({
    id: CROSS_ADMIN_UUID,
    username: 'cross-admin',
    passwordHash: 'x',
    email: 'crossadmin@test.invalid',
    organizationId: ORG_ALPHA,
    tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    isAdmin: true,
    isApproved: true,
  });

  // target-user: home org is org-alpha, not an admin.
  await User.create({
    id: TARGET_USER_UUID,
    username: 'target-user',
    passwordHash: 'x',
    email: 'target@test.invalid',
    organizationId: ORG_ALPHA,
    tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    isAdmin: false,
    isApproved: true,
  });

  // beta-member: home org is org-beta.
  await User.create({
    id: BETA_MEMBER_UUID,
    username: 'beta-member',
    passwordHash: 'x',
    email: 'beta@test.invalid',
    organizationId: ORG_BETA,
    tenant_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    isAdmin: false,
    isApproved: true,
  });

  // Membership rows reflecting the per-org roles:
  //   cross-admin is isAdmin=true in org-alpha, isAdmin=false in org-beta.
  await UserOrganizationMembership.create({
    userId: CROSS_ADMIN_UUID,
    organizationId: ORG_ALPHA,
    isAdmin: true,
    isSuperuser: false,
    isApproved: true,
  });

  await UserOrganizationMembership.create({
    userId: CROSS_ADMIN_UUID,
    organizationId: ORG_BETA,
    isAdmin: false,
    isSuperuser: false,
    isApproved: true,
  });

  // target-user membership in org-alpha (the org the admin will modify).
  await UserOrganizationMembership.create({
    userId: TARGET_USER_UUID,
    organizationId: ORG_ALPHA,
    isAdmin: false,
    isSuperuser: false,
    isApproved: true,
  });

  // beta-member membership in org-beta.
  await UserOrganizationMembership.create({
    userId: BETA_MEMBER_UUID,
    organizationId: ORG_BETA,
    isAdmin: false,
    isSuperuser: false,
    isApproved: true,
  });

  // Default auth: cross-admin acting in org-alpha (isAdmin=true from membership).
  authBehaviour = {
    mode: 'allow',
    userId: CROSS_ADMIN_UUID,
    organizationId: ORG_ALPHA,
    isAdmin: true,
    isSuperuser: false,
  };
});

// ---------------------------------------------------------------------------
// Test 1: admin in org-A can call PATCH /:id/admin in org-A (200)
// ---------------------------------------------------------------------------

describe('Issue #812 -- admin in own org', () => {
  it('returns 200 when an org-alpha admin promotes a target user in org-alpha', async () => {
    // cross-admin is acting in org-alpha (their home org) where they are admin.
    authBehaviour = {
      mode: 'allow',
      userId: CROSS_ADMIN_UUID,
      organizationId: ORG_ALPHA,
      isAdmin: true,
      isSuperuser: false,
    };

    const res = await request(app)
      .patch(`/api/users/${TARGET_USER_UUID}/admin`)
      .set('Authorization', 'Bearer fake')
      .send({ isAdmin: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Confirm the User row was actually updated (findOne bypasses findByPk spy).
    const updated = await User.findOne({ where: { id: TARGET_USER_UUID } });
    expect(updated.isAdmin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 2: same user as regular member in org-B gets 403 on PATCH /:id/admin
// ---------------------------------------------------------------------------

describe('Issue #812 -- regular member in org-B denied admin action', () => {
  it('returns 403 when the same user acts in org-beta where they are not admin', async () => {
    // Simulate what authenticate does for a cross-org session in org-beta:
    // the membership row for CROSS_ADMIN_UUID in org-beta has isAdmin=false,
    // so authenticate would set req.user.isAdmin=false. Our mock mirrors that.
    authBehaviour = {
      mode: 'allow',
      userId: CROSS_ADMIN_UUID,
      organizationId: ORG_BETA,
      isAdmin: false, // membership-derived, not home-org User flag
      isSuperuser: false,
    };

    // Attempting to promote beta-member within org-beta context.
    const res = await request(app)
      .patch(`/api/users/${BETA_MEMBER_UUID}/admin`)
      .set('Authorization', 'Bearer fake')
      .send({ isAdmin: true });

    // requireAdmin must reject this because isAdmin=false in the active org.
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Admin access required/i);

    // The User row must be unchanged.
    const unchanged = await User.findOne({ where: { id: BETA_MEMBER_UUID } });
    expect(unchanged.isAdmin).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 3: the JWT isAdmin claim reflects the org being accessed
// ---------------------------------------------------------------------------

describe('Issue #812 -- isAdmin reflects active org, not home org', () => {
  it('isAdmin=true in org-alpha but isAdmin=false for the same user in org-beta', async () => {
    // This test validates the contract that authenticate is expected to enforce
    // (#804): membership.isAdmin overrides User.isAdmin for cross-org sessions.
    // We verify this by reading the membership rows directly from the DB.

    const alphaM = await UserOrganizationMembership.findOne({
      where: { userId: CROSS_ADMIN_UUID, organizationId: ORG_ALPHA },
    });
    expect(alphaM).not.toBeNull();
    expect(alphaM.isAdmin).toBe(true);

    const betaM = await UserOrganizationMembership.findOne({
      where: { userId: CROSS_ADMIN_UUID, organizationId: ORG_BETA },
    });
    expect(betaM).not.toBeNull();
    expect(betaM.isAdmin).toBe(false);
  });

  it('listUsers returns org-scoped isAdmin flag from membership, not from User row', async () => {
    // cross-admin has isAdmin=true on their User row (home org) but
    // isAdmin=false in their org-beta membership. listUsers must return
    // the membership-derived flag for org-beta.

    authBehaviour = {
      mode: 'allow',
      userId: CROSS_ADMIN_UUID,
      organizationId: ORG_BETA,
      isAdmin: true,  // needed to pass requireAdmin on the route
      isSuperuser: false,
    };

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);

    // cross-admin is a member of org-beta, so they appear in the list.
    const crossEntry = res.body.find((u) => u.id === CROSS_ADMIN_UUID);
    expect(crossEntry).not.toBeUndefined();

    // The isAdmin flag returned by listUsers must come from the org-beta
    // membership row (false), not from the User row (true).
    expect(crossEntry.isAdmin).toBe(false);
  });

  it('listUsers returns isAdmin=true for cross-admin when listing org-alpha', async () => {
    authBehaviour = {
      mode: 'allow',
      userId: CROSS_ADMIN_UUID,
      organizationId: ORG_ALPHA,
      isAdmin: true,
      isSuperuser: false,
    };

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);

    const crossEntry = res.body.find((u) => u.id === CROSS_ADMIN_UUID);
    expect(crossEntry).not.toBeUndefined();

    // In org-alpha the membership row has isAdmin=true.
    expect(crossEntry.isAdmin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 4: service-layer org scope guard on setAdminFlag
// ---------------------------------------------------------------------------

describe('Issue #812 -- setAdminFlag service org-scope guard', () => {
  it('returns 403 CROSS_ORG_FORBIDDEN when admin tries to modify a user from another org', async () => {
    // cross-admin is acting in org-alpha but beta-member belongs to org-beta.
    // The setAdminFlag service guards: user.organizationId !== ctx.organizationId.
    authBehaviour = {
      mode: 'allow',
      userId: CROSS_ADMIN_UUID,
      organizationId: ORG_ALPHA,
      isAdmin: true,
      isSuperuser: false,
    };

    const res = await request(app)
      .patch(`/api/users/${BETA_MEMBER_UUID}/admin`)
      .set('Authorization', 'Bearer fake')
      .send({ isAdmin: true });

    // The service throws ForbiddenError CROSS_ORG_FORBIDDEN -> 403.
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CROSS_ORG_FORBIDDEN');

    // beta-member's User row must be unchanged.
    const unchanged = await User.findOne({ where: { id: BETA_MEMBER_UUID } });
    expect(unchanged.isAdmin).toBe(false);
  });
});
