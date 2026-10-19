/**
 * Issue #481 — Comment IDOR
 *
 * Defence-in-depth tests proving that comment routes enforce tenant isolation
 * at the application layer, independent of Postgres RLS. Uses SQLite so RLS is
 * absent by construction — any cross-tenant access that succeeds is a route-layer
 * failure, not an RLS misconfiguration.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Idea from '../../backend/src/models/Idea.js';
import Comment from '../../backend/src/models/Comment.js';
import CommentVote from '../../backend/src/models/CommentVote.js';
import Organization from '../../backend/src/models/Organization.js';

// Use the Sequelize class the production models are already bound to. Importing
// `Sequelize` from 'sequelize' separately under Jest experimental-vm-modules
// gives a different class identity, so `Comment.belongsTo(User, ...)` fails its
// internal `instanceof Sequelize.Model` check (issue #670 root cause).
const Sequelize = User.sequelize.constructor;

jest.unstable_mockModule('../../backend/src/middleware/profanityFilter.js', () => ({
  validateProfanity: () => (_req, _res, next) => next(),
  invalidateSettingsCache: () => {},
  checkProfanity: async (text) => ({ isProfane: false, cleanText: text }),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-comment-idor-tests';

const tenant1Id = '11111111-1111-1111-1111-111111111111';
const tenant2Id = '22222222-2222-2222-2222-222222222222';
const org1Handle = 'org-one';
const org2Handle = 'org-two';

const user1AdminId = 101;
const user2AdminId = 102;

const user1AdminToken = jwt.sign(
  { id: user1AdminId, username: 'org1admin', isAdmin: true, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const user2AdminToken = jwt.sign(
  { id: user2AdminId, username: 'org2admin', isAdmin: true, organizationId: org2Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: commentsRoutes } = await import('../../backend/src/routes/comments.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

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
      slug: { type: Sequelize.STRING },
      authorId: { type: Sequelize.INTEGER },
      organizationId: { type: Sequelize.STRING },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'Idea', tableName: 'Ideas' }
  );

  Comment.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      content: { type: Sequelize.TEXT },
      ideaId: { type: Sequelize.UUID },
      authorId: { type: Sequelize.INTEGER },
      isAdminOnly: { type: Sequelize.BOOLEAN, defaultValue: false },
      isEdited: { type: Sequelize.BOOLEAN, defaultValue: false },
      editedAt: { type: Sequelize.DATE },
      editHistory: { type: Sequelize.JSON },
      organizationId: { type: Sequelize.STRING },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'Comment', tableName: 'Comments' }
  );

  CommentVote.init(
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      commentId: { type: Sequelize.UUID },
      userId: { type: Sequelize.INTEGER },
      value: { type: Sequelize.INTEGER },
      organizationId: { type: Sequelize.STRING }, // #734: added to CommentVote model; included here so the userVotes findAll in the GET handler does not blow up.
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'CommentVote', tableName: 'CommentVotes' }
  );

  Organization.init(
    {
      id: { type: Sequelize.STRING, primaryKey: true },
      name: { type: Sequelize.STRING },
      allowSelfRegistration: { type: Sequelize.BOOLEAN, defaultValue: true },
    },
    { sequelize, modelName: 'Organization', tableName: 'Organizations' }
  );

  Comment.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  Comment.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Idea.hasMany(Comment, { as: 'ideaComments', foreignKey: 'ideaId' });
  Comment.hasMany(CommentVote, { as: 'votes', foreignKey: 'commentId' });

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/comments', authenticate, commentsRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

async function seedTwoTenantComment({ commentAuthorId, commentTenant, ideaTenant }) {
  const idea = await Idea.create({
    title: `Idea in tenant ${ideaTenant}`,
    authorId: commentAuthorId,
    organizationId: ideaTenant === tenant1Id ? org1Handle : org2Handle,
    tenant_id: ideaTenant,
  });

  const comment = await Comment.create({
    content: `Seeded comment in tenant ${commentTenant}`,
    ideaId: idea.id,
    authorId: commentAuthorId,
    editHistory: [],
    isAdminOnly: false,
    organizationId: commentTenant === tenant1Id ? org1Handle : org2Handle,
    tenant_id: commentTenant,
  });

  return { idea, comment };
}

beforeEach(async () => {
  await CommentVote.destroy({ where: {}, truncate: true });
  await Comment.destroy({ where: {}, truncate: true });
  await Idea.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  const user1Admin = {
    id: user1AdminId,
    username: 'org1admin',
    email: 'org1admin@test.com',
    isAdmin: true,
    isAnonymous: false,
    organizationId: org1Handle,
    tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };

  const user2Admin = {
    id: user2AdminId,
    username: 'org2admin',
    email: 'org2admin@test.com',
    isAdmin: true,
    isAnonymous: false,
    organizationId: org2Handle,
    tenant_id: tenant2Id,
    toJSON() { return { ...this }; },
  };

  testUsers[user1AdminId] = user1Admin;
  testUsers[user2AdminId] = user2Admin;

  await User.create({ ...user1Admin });
  await User.create({ ...user2Admin });
});

describe('Issue #481 — DELETE /api/comments/:id rejects cross-tenant delete', () => {
  it('returns 404 when tenant-1 admin attempts to delete tenant-2 comment', async () => {
    const { comment } = await seedTwoTenantComment({
      commentAuthorId: user2AdminId,
      commentTenant: tenant2Id,
      ideaTenant: tenant2Id,
    });

    const response = await request(app)
      .delete(`/api/comments/${comment.id}`)
      .set('Authorization', `Bearer ${user1AdminToken}`);

    expect(response.status).toBe(404);

    const stillThere = await Comment.findByPk(comment.id);
    expect(stillThere).not.toBeNull();
  });
});

describe('Issue #481 — PUT /api/comments/:id rejects cross-tenant edit', () => {
  it('returns 404 when tenant-1 admin attempts to edit tenant-2 comment', async () => {
    const { comment } = await seedTwoTenantComment({
      commentAuthorId: user2AdminId,
      commentTenant: tenant2Id,
      ideaTenant: tenant2Id,
    });

    const response = await request(app)
      .put(`/api/comments/${comment.id}`)
      .set('Authorization', `Bearer ${user1AdminToken}`)
      .send({ content: 'Hacked content from tenant 1 admin' });

    expect(response.status).toBe(404);

    const unchanged = await Comment.findByPk(comment.id);
    expect(unchanged.content).toBe(`Seeded comment in tenant ${tenant2Id}`);
    expect(unchanged.isEdited).toBe(false);
  });
});

describe('Issue #481 — POST /api/comments/:id/upvote rejects cross-tenant upvote', () => {
  it('returns 404 when tenant-1 admin attempts to upvote tenant-2 comment', async () => {
    const { comment } = await seedTwoTenantComment({
      commentAuthorId: user2AdminId,
      commentTenant: tenant2Id,
      ideaTenant: tenant2Id,
    });

    const response = await request(app)
      .post(`/api/comments/${comment.id}/upvote`)
      .set('Authorization', `Bearer ${user1AdminToken}`);

    expect(response.status).toBe(404);

    const voteCount = await CommentVote.count({ where: { commentId: comment.id } });
    expect(voteCount).toBe(0);
  });
});

describe('Issue #481 — null tenant_id hardening', () => {
  it('rejects DELETE with 403 when the authenticated user has null tenant_id', async () => {
    const { comment } = await seedTwoTenantComment({
      commentAuthorId: user1AdminId,
      commentTenant: tenant1Id,
      ideaTenant: tenant1Id,
    });

    testUsers[user1AdminId] = { ...testUsers[user1AdminId], tenant_id: null };

    const response = await request(app)
      .delete(`/api/comments/${comment.id}`)
      .set('Authorization', `Bearer ${user1AdminToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/tenant context/i);

    const stillThere = await Comment.findByPk(comment.id);
    expect(stillThere).not.toBeNull();
  });

  it('rejects PUT with 403 when the authenticated user has null tenant_id', async () => {
    const { comment } = await seedTwoTenantComment({
      commentAuthorId: user1AdminId,
      commentTenant: tenant1Id,
      ideaTenant: tenant1Id,
    });

    testUsers[user1AdminId] = { ...testUsers[user1AdminId], tenant_id: null };

    const response = await request(app)
      .put(`/api/comments/${comment.id}`)
      .set('Authorization', `Bearer ${user1AdminToken}`)
      .send({ content: 'Null-tenant hardening check' });

    expect(response.status).toBe(403);
  });

  it('rejects POST upvote with 403 when the authenticated user has null tenant_id', async () => {
    const { comment } = await seedTwoTenantComment({
      commentAuthorId: user1AdminId,
      commentTenant: tenant1Id,
      ideaTenant: tenant1Id,
    });

    testUsers[user1AdminId] = { ...testUsers[user1AdminId], tenant_id: null };

    const response = await request(app)
      .post(`/api/comments/${comment.id}/upvote`)
      .set('Authorization', `Bearer ${user1AdminToken}`);

    expect(response.status).toBe(403);
  });
});
