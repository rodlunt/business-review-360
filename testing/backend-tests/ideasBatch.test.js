/**
 * Issue #522: POST /api/ideas/batch
 *
 * Admin batch update endpoint. Applies one of a fixed set of actions
 * (setStatus / setPinned / setCategory / setPriority) to many ideas in a
 * single transaction, scoped to the caller's organisation.
 *
 * Harness shape mirrors testing/backend-tests/ideasPagination.test.js
 * (see #568): an in-memory SQLite Sequelize re-init'd against the
 * production model classes via the User.sequelize.constructor identity.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Idea from '../../backend/src/models/Idea.js';
import Vote from '../../backend/src/models/Vote.js';
import Comment from '../../backend/src/models/Comment.js';
import Organization from '../../backend/src/models/Organization.js';

const Sequelize = User.sequelize.constructor;

jest.unstable_mockModule('../../backend/src/middleware/profanityFilter.js', () => ({
  validateProfanity: () => (_req, _res, next) => next(),
  invalidateSettingsCache: () => {},
  checkProfanity: async (text) => ({ isProfane: false, cleanText: text }),
}));

jest.unstable_mockModule('../../backend/src/middleware/planLimits.js', () => ({
  checkPlanLimit: () => (_req, _res, next) => next(),
}));

// logAuditEvent writes to platformSequelize which the in-memory harness
// does not bind. Stub it so audit-write failures cannot affect the
// behaviour under test.
const auditEventCalls = [];
jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  logAuditEvent: jest.fn(async (_req, payload) => {
    auditEventCalls.push(payload);
  }),
  AuditLog: {},
  auditLogger: () => (_req, _res, next) => next(),
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-ideas-batch-tests';

const tenant1Id = '11111111-1111-1111-1111-111111111111';
const tenant2Id = '22222222-2222-2222-2222-222222222222';
const org1Handle = 'org-one';
const org2Handle = 'org-two';

const adminUserId = 301;
const regularUserId = 302;
const otherOrgAdminId = 303;

const adminToken = jwt.sign(
  { id: adminUserId, username: 'admin1', isAdmin: true, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularUserId, username: 'user1', isAdmin: false, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const otherOrgAdminToken = jwt.sign(
  { id: otherOrgAdminId, username: 'admin2', isAdmin: true, organizationId: org2Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {};
jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: ideasRoutes } = await import('../../backend/src/routes/ideas.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');
const auditLogModule = await import('../../backend/src/middleware/auditLog.js');

let sequelize;
let app;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

  User.init(
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING },
      email: { type: Sequelize.STRING },
      passwordHash: { type: Sequelize.STRING },
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      isAnonymous: { type: Sequelize.BOOLEAN, defaultValue: false },
      isApproved: { type: Sequelize.BOOLEAN, defaultValue: true },
      organizationId: { type: Sequelize.STRING },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'User', tableName: 'Users' }
  );

  Idea.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      title: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      category: { type: Sequelize.STRING },
      status: { type: Sequelize.STRING, defaultValue: 'Reviewing' },
      priority: { type: Sequelize.INTEGER },
      isPinned: { type: Sequelize.BOOLEAN, defaultValue: false },
      isPrivate: { type: Sequelize.BOOLEAN, defaultValue: false },
      slug: { type: Sequelize.STRING },
      authorId: { type: Sequelize.INTEGER },
      organizationId: { type: Sequelize.STRING },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'Idea', tableName: 'Ideas' }
  );

  Vote.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      ideaId: { type: Sequelize.UUID },
      userId: { type: Sequelize.INTEGER },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'Vote', tableName: 'Votes' }
  );

  Comment.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      content: { type: Sequelize.TEXT },
      ideaId: { type: Sequelize.UUID },
      authorId: { type: Sequelize.INTEGER },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'Comment', tableName: 'Comments' }
  );

  Organization.init(
    {
      id: { type: Sequelize.STRING, primaryKey: true },
      name: { type: Sequelize.STRING },
    },
    { sequelize, modelName: 'Organization', tableName: 'Organizations' }
  );

  Idea.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  User.hasMany(Idea, { as: 'ideas', foreignKey: 'authorId' });
  Vote.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Idea.hasMany(Vote, { as: 'votes', foreignKey: 'ideaId' });
  Idea.hasMany(Comment, { as: 'ideaComments', foreignKey: 'ideaId' });

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/ideas', authenticate, ideasRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

async function seedIdea({ organizationId, tenant_id, authorId, title = 'Idea', status = 'Reviewing', isPinned = false }) {
  return Idea.create({
    title,
    description: 'd',
    slug: `${title.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
    authorId,
    organizationId,
    tenant_id,
    isPrivate: false,
    isPinned,
    status,
  });
}

beforeEach(async () => {
  auditEventCalls.length = 0;
  await Vote.destroy({ where: {}, truncate: true });
  await Comment.destroy({ where: {}, truncate: true });
  await Idea.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  const adminUser = {
    id: adminUserId,
    username: 'admin1',
    email: 'admin1@test.com',
    isAdmin: true,
    isAnonymous: false,
    organizationId: org1Handle,
    tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };

  const regularUser = {
    id: regularUserId,
    username: 'user1',
    email: 'user1@test.com',
    isAdmin: false,
    isAnonymous: false,
    organizationId: org1Handle,
    tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };

  const otherOrgAdmin = {
    id: otherOrgAdminId,
    username: 'admin2',
    email: 'admin2@test.com',
    isAdmin: true,
    isAnonymous: false,
    organizationId: org2Handle,
    tenant_id: tenant2Id,
    toJSON() { return { ...this }; },
  };

  testUsers[adminUserId] = adminUser;
  testUsers[regularUserId] = regularUser;
  testUsers[otherOrgAdminId] = otherOrgAdmin;

  await User.create({ ...adminUser });
  await User.create({ ...regularUser });
  await User.create({ ...otherOrgAdmin });
});

describe('POST /api/ideas/batch: happy paths', () => {
  it('setStatus updates every targeted idea in a single response', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });
    const b = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'B' });
    const c = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'C' });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id, b.id, c.id], action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(200);
    expect(response.body.updated).toBe(3);
    expect(response.body.action).toBe('setStatus');
    expect(response.body.ids.sort()).toEqual([a.id, b.id, c.id].sort());

    const reloaded = await Idea.findAll({ where: { organizationId: org1Handle } });
    reloaded.forEach((row) => expect(row.status).toBe('Approved'));
  });

  it('setPinned toggles the boolean for every targeted idea', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });
    const b = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'B' });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id, b.id], action: 'setPinned', payload: { isPinned: true } });

    expect(response.status).toBe(200);
    expect(response.body.updated).toBe(2);

    const reloaded = await Idea.findAll({ where: { organizationId: org1Handle } });
    reloaded.forEach((row) => expect(row.isPinned).toBe(true));
  });

  it('writes a single audit-log entry per batch with the changes blob', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });
    const b = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'B' });

    await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id, b.id], action: 'setStatus', payload: { status: 'Complete' } });

    expect(auditEventCalls).toHaveLength(1);
    expect(auditEventCalls[0]).toEqual(
      expect.objectContaining({
        action: 'idea.batch',
        resourceType: 'idea',
        resourceId: null,
        changes: expect.objectContaining({
          batchAction: 'setStatus',
          payload: { status: 'Complete' },
          count: 2,
        }),
        status: 'success',
      })
    );
    expect(auditEventCalls[0].changes.ids.sort()).toEqual([a.id, b.id].sort());
  });
});

describe('POST /api/ideas/batch: tenant scoping', () => {
  it('rejects the entire batch with 400 when an id belongs to another organisation', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });
    const cross = await seedIdea({ organizationId: org2Handle, tenant_id: tenant2Id, authorId: otherOrgAdminId, title: 'Cross' });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id, cross.id], action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('BATCH_IDS_NOT_FOUND');
    expect(response.body.details.missing).toEqual([cross.id]);

    const reloaded = await Idea.findByPk(a.id);
    expect(reloaded.status).toBe('Reviewing');
    expect(auditEventCalls).toHaveLength(0);
  });

  it('rejects the batch when an id does not exist anywhere', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });
    const ghost = '99999999-9999-4999-8999-999999999999';

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id, ghost], action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('BATCH_IDS_NOT_FOUND');
    expect(response.body.details.missing).toEqual([ghost]);
  });
});

describe('POST /api/ideas/batch: role and validation', () => {
  it('blocks non-admin callers with 403', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ ids: [a.id], action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(403);
  });

  it('rejects an empty ids array with INVALID_BATCH_IDS', async () => {
    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [], action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_IDS');
  });

  it('rejects an oversized ids array with BATCH_TOO_LARGE', async () => {
    const ids = Array.from({ length: 101 }, (_, i) =>
      `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`
    );

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids, action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('BATCH_TOO_LARGE');
  });

  it('rejects non-UUID ids with INVALID_BATCH_IDS', async () => {
    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: ['not-a-uuid'], action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_IDS');
  });

  it('rejects an unknown action with INVALID_BATCH_ACTION', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id], action: 'banana', payload: {} });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_ACTION');
  });

  it('rejects an unknown status value with INVALID_BATCH_PAYLOAD', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id], action: 'setStatus', payload: { status: 'NotAStatus' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_PAYLOAD');
  });

  it('rejects setPinned with a non-boolean payload', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id], action: 'setPinned', payload: { isPinned: 'yes' } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_BATCH_PAYLOAD');
  });
});

describe('POST /api/ideas/batch: audit-log durability', () => {
  it('returns 500 BATCH_AUDIT_WRITE_FAILED when the audit-log write throws', async () => {
    const a = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'A' });

    auditLogModule.logAuditEvent.mockImplementationOnce(async () => {
      throw new Error('platform db unreachable');
    });

    const response = await request(app)
      .post('/api/ideas/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [a.id], action: 'setStatus', payload: { status: 'Approved' } });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('BATCH_AUDIT_WRITE_FAILED');

    // The data update committed before the audit attempt; the row is
    // already at the new status. The 500 surfaces the audit gap so it
    // cannot be missed in production.
    const reloaded = await Idea.findByPk(a.id);
    expect(reloaded.status).toBe('Approved');
  });
});
