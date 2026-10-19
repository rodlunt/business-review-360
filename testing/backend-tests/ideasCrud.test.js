/**
 * Tests for single-idea CRUD endpoints:
 *   GET    /api/ideas/:identifier
 *   PUT    /api/ideas/:id
 *   DELETE /api/ideas/:id
 *   PATCH  /api/ideas/:id/admin
 *
 * Harness mirrors ideasBatch.test.js. Mocks: profanityFilter (used by PUT and
 * PATCH), planLimits (imported by the route module), auditLog (imported by
 * route module, only used in batch which is not under test here).
 *
 * The notificationEmailService calls inside updateIdea / adminUpdateIdea are
 * fire-and-forget (.catch-wrapped); a mock is registered to avoid spurious
 * console noise but test outcomes do not depend on it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Idea from '../../backend/src/models/Idea.js';
import Vote from '../../backend/src/models/Vote.js';
import Comment from '../../backend/src/models/Comment.js';
import Category from '../../backend/src/models/Category.js';
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

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  logAuditEvent: jest.fn(async () => {}),
  AuditLog: {},
  auditLogger: () => (_req, _res, next) => next(),
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
}));

jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendNewIdeaSubmittedEmail: jest.fn(async () => {}),
  sendStatusChangeEmail: jest.fn(async () => {}),
  sendIdeaImplementedEmail: jest.fn(async () => {}),
  sendCommentOnIdeaEmail: jest.fn(async () => {}),
  sendCommentReplyEmail: jest.fn(async () => {}),
  sendPasswordResetEmail: jest.fn(async () => {}),
  sendWelcomeEmail: jest.fn(async () => {}),
  sendVerificationEmail: jest.fn(async () => {}),
  sendPasswordChangedEmail: jest.fn(async () => {}),
  sendAdminUserPendingApprovalEmail: jest.fn(async () => {}),
  sendUserAccountApprovedEmail: jest.fn(async () => {}),
  sendIdeasNeedAttentionEmail: jest.fn(async () => {}),
  sendDailyIdeaDigestEmail: jest.fn(async () => {}),
  sendAccountSetupEmail: jest.fn(async () => {}),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-ideas-crud-tests';

const tenant1Id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const tenant2Id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const org1Handle = 'crud-org-one';
const org2Handle = 'crud-org-two';

const adminUserId = 601;
const regularUserId = 602;
const otherOrgAdminId = 603;

const adminToken = jwt.sign(
  { id: adminUserId, username: 'crudadmin', isAdmin: true, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularUserId, username: 'cruduser', isAdmin: false, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const org2Token = jwt.sign(
  { id: otherOrgAdminId, username: 'crudadmin2', isAdmin: true, organizationId: org2Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {};
jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: ideasRoutes } = await import('../../backend/src/routes/ideas.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let sequelize;
let app;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

  User.init(
    {
      id: { type: Sequelize.INTEGER, primaryKey: true },
      username: { type: Sequelize.STRING },
      email: { type: Sequelize.STRING },
      passwordHash: { type: Sequelize.STRING },
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      isSuperuser: { type: Sequelize.BOOLEAN, defaultValue: false },
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
      impactScore: { type: Sequelize.INTEGER },
      effortScore: { type: Sequelize.INTEGER },
      additionalComments: { type: Sequelize.TEXT },
    },
    { sequelize, modelName: 'Idea', tableName: 'Ideas' }
  );

  Vote.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      ideaId: { type: Sequelize.UUID },
      userId: { type: Sequelize.INTEGER },
      value: { type: Sequelize.INTEGER, defaultValue: 1 },
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

  Category.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      name: { type: Sequelize.STRING },
      organizationId: { type: Sequelize.STRING },
      createdBy: { type: Sequelize.INTEGER },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'Category', tableName: 'Categories' }
  );

  Organization.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      organizationId: { type: Sequelize.STRING },
      organizationName: { type: Sequelize.STRING, defaultValue: 'Test Org' },
    },
    { sequelize, modelName: 'Organization', tableName: 'Organizations' }
  );

  Idea.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  User.hasMany(Idea, { as: 'ideas', foreignKey: 'authorId' });
  Vote.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Idea.hasMany(Vote, { as: 'votes', foreignKey: 'ideaId' });
  Comment.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Idea.hasMany(Comment, { as: 'ideaComments', foreignKey: 'ideaId' });
  Comment.belongsTo(User, { as: 'author', foreignKey: 'authorId' });

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/ideas', authenticate, ideasRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

async function seedIdea({
  organizationId,
  tenant_id,
  authorId,
  title = 'Test Idea',
  status = 'Reviewing',
  isPrivate = false,
  isPinned = false,
}) {
  const rand = Math.random().toString(36).slice(2, 8);
  return Idea.create({
    title,
    description: 'A test idea',
    slug: `test-idea-${rand}`,
    authorId,
    organizationId,
    tenant_id,
    status,
    isPrivate,
    isPinned,
  });
}

beforeEach(async () => {
  await Vote.destroy({ where: {}, truncate: true });
  await Comment.destroy({ where: {}, truncate: true });
  await Category.destroy({ where: {}, truncate: true });
  await Idea.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  const adminUser = {
    id: adminUserId, username: 'crudadmin', email: 'crudadmin@test.com',
    isAdmin: true, isAnonymous: false, isApproved: true,
    organizationId: org1Handle, tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };
  const regularUser = {
    id: regularUserId, username: 'cruduser', email: 'cruduser@test.com',
    isAdmin: false, isAnonymous: false, isApproved: true,
    organizationId: org1Handle, tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };
  const otherOrgAdmin = {
    id: otherOrgAdminId, username: 'crudadmin2', email: 'crudadmin2@test.com',
    isAdmin: true, isAnonymous: false, isApproved: true,
    organizationId: org2Handle, tenant_id: tenant2Id,
    toJSON() { return { ...this }; },
  };

  testUsers[adminUserId] = adminUser;
  testUsers[regularUserId] = regularUser;
  testUsers[otherOrgAdminId] = otherOrgAdmin;

  await User.create({ ...adminUser });
  await User.create({ ...regularUser });
  await User.create({ ...otherOrgAdmin });
});

// ---------------------------------------------------------------------------
// GET /api/ideas/:identifier
// ---------------------------------------------------------------------------

describe('GET /api/ideas/:identifier: happy path', () => {
  it('returns 200 with idea data when fetching by slug', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, title: 'Slug Idea' });

    const res = await request(app)
      .get(`/api/ideas/${idea.slug}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(idea.id);
    expect(res.body.title).toBe('Slug Idea');
  });

  it('returns 200 with idea data when fetching by UUID', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(idea.id);
  });

  it('response includes isAdminAuthor and authorName fields', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body).toHaveProperty('isAdminAuthor');
    expect(res.body).toHaveProperty('authorName');
    expect(res.body.isAdminAuthor).toBe(true);
    expect(res.body.authorName).toBe('crudadmin');
  });

  it('response includes votes array', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(Array.isArray(res.body.votes)).toBe(true);
  });
});

describe('GET /api/ideas/:identifier: visibility rules', () => {
  it('returns 404 with code IDEA_NOT_FOUND for unknown slug', async () => {
    const res = await request(app)
      .get('/api/ideas/no-such-slug-exists')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });

  it('returns 404 with code IDEA_NOT_FOUND for unknown UUID', async () => {
    const res = await request(app)
      .get('/api/ideas/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });

  it('returns 403 IDEA_ACCESS_DENIED when non-owner non-admin fetches a private idea', async () => {
    const idea = await seedIdea({
      organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, isPrivate: true,
    });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDEA_ACCESS_DENIED');
  });

  it('returns 200 when the private idea owner fetches their own idea', async () => {
    const idea = await seedIdea({
      organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId, isPrivate: true,
    });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 200 when admin fetches any private idea', async () => {
    const idea = await seedIdea({
      organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId, isPrivate: true,
    });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 for a "Closed - Hidden" idea when accessed by non-admin', async () => {
    const idea = await seedIdea({
      organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, status: 'Closed - Hidden',
    });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });

  it('returns 200 for a "Closed - Hidden" idea when accessed by admin', async () => {
    const idea = await seedIdea({
      organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId, status: 'Closed - Hidden',
    });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/ideas/:identifier: tenant isolation', () => {
  it('returns 404 when an org-two user fetches an org-one idea by UUID', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .get(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${org2Token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });
});

describe('GET /api/ideas/:identifier: auth', () => {
  it('returns 401 when no Authorization header is supplied', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app).get(`/api/ideas/${idea.id}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/ideas/:id
// ---------------------------------------------------------------------------

describe('PUT /api/ideas/:id: happy path', () => {
  it('returns 200 and updates the title when the author edits their own idea', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .put(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  it('returns 200 and updates the title when an admin edits any idea', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .put(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Admin Updated' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Admin Updated');
  });

  it('persists the change to the database', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    await request(app)
      .put(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ title: 'Persisted Title' });

    const reloaded = await Idea.findByPk(idea.id);
    expect(reloaded.title).toBe('Persisted Title');
  });
});

describe('PUT /api/ideas/:id: ownership and auth', () => {
  it('returns 403 IDEA_EDIT_FORBIDDEN when non-owner non-admin attempts to edit', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .put(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDEA_EDIT_FORBIDDEN');
  });

  it('returns 401 with no token', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app).put(`/api/ideas/${idea.id}`).send({ title: 'No auth' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/ideas/:id: not found', () => {
  it('returns 404 for a non-existent UUID', async () => {
    const res = await request(app)
      .put('/api/ideas/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Ghost' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });

  it('returns 404 for a UUID belonging to another org', async () => {
    const org2Idea = await seedIdea({ organizationId: org2Handle, tenant_id: tenant2Id, authorId: otherOrgAdminId });

    const res = await request(app)
      .put(`/api/ideas/${org2Idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Cross-org edit' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/ideas/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/ideas/:id: happy path', () => {
  it('returns 200 { success: true } when the author deletes their own idea', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .delete(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('removes the idea row from the database', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    await request(app)
      .delete(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    const gone = await Idea.findByPk(idea.id);
    expect(gone).toBeNull();
  });

  it('returns 200 when an admin deletes any idea in their org', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .delete(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/ideas/:id: ownership and auth', () => {
  it('returns 403 IDEA_DELETE_FORBIDDEN when non-owner non-admin attempts to delete', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .delete(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDEA_DELETE_FORBIDDEN');
  });

  it('idea is not deleted after a rejected attempt', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    await request(app)
      .delete(`/api/ideas/${idea.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    const stillThere = await Idea.findByPk(idea.id);
    expect(stillThere).not.toBeNull();
  });

  it('returns 401 with no token', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app).delete(`/api/ideas/${idea.id}`);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/ideas/:id: tenant isolation', () => {
  it('returns 404 when org-two admin tries to delete an org-one idea', async () => {
    const org1Idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .delete(`/api/ideas/${org1Idea.id}`)
      .set('Authorization', `Bearer ${org2Token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');

    const stillThere = await Idea.findByPk(org1Idea.id);
    expect(stillThere).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/ideas/:id/admin
// ---------------------------------------------------------------------------

describe('PATCH /api/ideas/:id/admin: happy path', () => {
  it('returns 200 and updates status when admin patches idea', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .patch(`/api/ideas/${idea.id}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Approved');
  });

  it('persists the status change to the database', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    await request(app)
      .patch(`/api/ideas/${idea.id}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Complete' });

    const reloaded = await Idea.findByPk(idea.id);
    expect(reloaded.status).toBe('Complete');
  });

  it('returns 200 and sets isPinned to true', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .patch(`/api/ideas/${idea.id}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isPinned: true });

    expect(res.status).toBe(200);
    expect(res.body.isPinned).toBe(true);
  });

  it('returns 200 and updates impactScore and effortScore', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .patch(`/api/ideas/${idea.id}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ impactScore: 4, effortScore: 2 });

    expect(res.status).toBe(200);
    expect(res.body.impactScore).toBe(4);
    expect(res.body.effortScore).toBe(2);
  });
});

describe('PATCH /api/ideas/:id/admin: role guard', () => {
  it('returns 403 when a non-admin calls PATCH /:id/admin', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: regularUserId });

    const res = await request(app)
      .patch(`/api/ideas/${idea.id}/admin`)
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ status: 'Approved' });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: adminUserId });

    const res = await request(app)
      .patch(`/api/ideas/${idea.id}/admin`)
      .send({ status: 'Approved' });

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/ideas/:id/admin: not found', () => {
  it('returns 404 for a non-existent UUID', async () => {
    const res = await request(app)
      .patch('/api/ideas/00000000-0000-4000-8000-000000000099/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });

  it('returns 404 for a UUID belonging to another org', async () => {
    const org2Idea = await seedIdea({ organizationId: org2Handle, tenant_id: tenant2Id, authorId: otherOrgAdminId });

    const res = await request(app)
      .patch(`/api/ideas/${org2Idea.id}/admin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Approved' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IDEA_NOT_FOUND');
  });
});
