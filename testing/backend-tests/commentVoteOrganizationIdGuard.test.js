/**
 * Issue #734 - organizationId application-guard on CommentVote routes.
 *
 * Mirrors commentOrganizationIdGuard.test.js (#493/#726) for the CommentVotes
 * table. The headline gap pre-fix was DELETE /api/comments/:id/upvote, which
 * had NO tenant filter at all and would let a logged-in user delete any vote
 * whose commentId they could enumerate. Same SQLite-no-RLS construction so any
 * cross-tenant access that succeeds is a route-layer failure, not RLS.
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

const Sequelize = User.sequelize.constructor;

jest.unstable_mockModule('../../backend/src/middleware/profanityFilter.js', () => ({
  validateProfanity: () => (_req, _res, next) => next(),
  invalidateSettingsCache: () => {},
  checkProfanity: async (text) => ({ isProfane: false, cleanText: text }),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-commentvote-org-id-tests';

const tenant1Id = '11111111-1111-1111-1111-111111111111';
const tenant2Id = '22222222-2222-2222-2222-222222222222';
const org1Handle = 'org-one';
const org2Handle = 'org-two';

const user1Id = 301;
const user2Id = 302;

const user1Token = jwt.sign(
  { id: user1Id, username: 'org1user', isAdmin: false, organizationId: org1Handle },
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
      organizationId: { type: Sequelize.STRING },
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
  Idea.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  Comment.hasMany(CommentVote, { as: 'votes', foreignKey: 'commentId' });

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/comments', authenticate, commentsRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await CommentVote.destroy({ where: {}, truncate: true });
  await Comment.destroy({ where: {}, truncate: true });
  await Idea.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  const user1 = {
    id: user1Id,
    username: 'org1user',
    email: 'org1user@test.com',
    isAdmin: false,
    isAnonymous: false,
    organizationId: org1Handle,
    tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };

  const user2 = {
    id: user2Id,
    username: 'org2user',
    email: 'org2user@test.com',
    isAdmin: false,
    isAnonymous: false,
    organizationId: org2Handle,
    tenant_id: tenant2Id,
    toJSON() { return { ...this }; },
  };

  testUsers[user1Id] = user1;
  testUsers[user2Id] = user2;

  await User.create({ ...user1 });
  await User.create({ ...user2 });
});

describe('Issue #734 - CommentVotes.organizationId persisted on insert', () => {
  it('POST /api/comments/:id/upvote stores organizationId from the authenticated user', async () => {
    const idea = await Idea.create({
      title: 'Idea in org-one',
      authorId: user1Id,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    const comment = await Comment.create({
      content: 'Comment in org-one',
      ideaId: idea.id,
      authorId: user1Id,
      editHistory: [],
      isAdminOnly: false,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    const response = await request(app)
      .post(`/api/comments/${comment.id}/upvote`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(201);

    const persistedVotes = await CommentVote.findAll({ where: { commentId: comment.id } });
    expect(persistedVotes).toHaveLength(1);
    expect(persistedVotes[0].organizationId).toBe(org1Handle);
    expect(persistedVotes[0].tenant_id).toBe(tenant1Id);
  });

  it('POST /api/comments/idea/:ideaId auto-upvote also stores organizationId', async () => {
    const idea = await Idea.create({
      title: 'Idea in org-one',
      authorId: user1Id,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    const response = await request(app)
      .post(`/api/comments/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ content: 'Auto-upvoted by author' });

    expect(response.status).toBe(201);

    const persistedVotes = await CommentVote.findAll({ where: { commentId: response.body.id } });
    expect(persistedVotes).toHaveLength(1);
    expect(persistedVotes[0].organizationId).toBe(org1Handle);
    expect(persistedVotes[0].tenant_id).toBe(tenant1Id);
  });
});

describe('Issue #734 - DELETE /api/comments/:id/upvote rejects cross-tenant votes', () => {
  it('returns 404 when the commentId belongs to another tenant (parent-comment guard)', async () => {
    // The smuggled situation: a comment exists in org-two, and a vote exists
    // in org-two by user1 (who lives in org-one). Pre-fix, DELETE upvote
    // looked up the vote by {commentId, userId} only, so user1 could destroy
    // a vote that belongs to a comment they should not see at all.
    const idea2 = await Idea.create({
      title: 'Idea in org-two',
      authorId: user2Id,
      organizationId: org2Handle,
      tenant_id: tenant2Id,
    });

    const comment2 = await Comment.create({
      content: 'Comment in org-two',
      ideaId: idea2.id,
      authorId: user2Id,
      editHistory: [],
      isAdminOnly: false,
      organizationId: org2Handle,
      tenant_id: tenant2Id,
    });

    // Smuggled vote: same userId (user1) but the commentId points at org-two.
    // This is the row that pre-fix was deletable cross-tenant.
    await CommentVote.create({
      commentId: comment2.id,
      userId: user1Id,
      value: 1,
      organizationId: org2Handle,
      tenant_id: tenant2Id,
    });

    const response = await request(app)
      .delete(`/api/comments/${comment2.id}/upvote`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Comment not found');

    // Vote must still exist after the rejected delete.
    const stillThere = await CommentVote.findOne({ where: { commentId: comment2.id, userId: user1Id } });
    expect(stillThere).not.toBeNull();
  });

  it('returns 404 when the vote organizationId is mismatched even though the comment is in-tenant', async () => {
    // Edge: a comment legitimately exists in org-one (parent-guard passes),
    // but the CommentVote row carries a smuggled organizationId pointing at
    // org-two. The application-guard on the vote WHERE clause is the second
    // line of defence here: even if the parent lookup succeeds, the vote
    // lookup must not return a cross-org row.
    const idea1 = await Idea.create({
      title: 'Idea in org-one',
      authorId: user1Id,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    const comment1 = await Comment.create({
      content: 'Comment in org-one',
      ideaId: idea1.id,
      authorId: user1Id,
      editHistory: [],
      isAdminOnly: false,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    // Smuggled vote with mismatched organizationId.
    await CommentVote.create({
      commentId: comment1.id,
      userId: user1Id,
      value: 1,
      organizationId: org2Handle,
      tenant_id: tenant1Id,
    });

    const response = await request(app)
      .delete(`/api/comments/${comment1.id}/upvote`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Vote not found');

    const stillThere = await CommentVote.findOne({ where: { commentId: comment1.id, userId: user1Id } });
    expect(stillThere).not.toBeNull();
  });
});

describe('Issue #734 - userVote read paths filter by organizationId', () => {
  it('GET /api/comments/idea/:ideaId reports userVoted=false when the vote organizationId is mismatched', async () => {
    const idea = await Idea.create({
      title: 'Idea in org-one',
      authorId: user1Id,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    const comment = await Comment.create({
      content: 'Comment in org-one',
      ideaId: idea.id,
      authorId: user1Id,
      editHistory: [],
      isAdminOnly: false,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    // Smuggled vote: same userId, same commentId, same tenant_id, but
    // organizationId belongs to org-two. The userVotes lookup must not pick
    // this up, so userVoted should be false in the response.
    await CommentVote.create({
      commentId: comment.id,
      userId: user1Id,
      value: 1,
      organizationId: org2Handle,
      tenant_id: tenant1Id,
    });

    const response = await request(app)
      .get(`/api/comments/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].userVoted).toBe(false);
  });
});
