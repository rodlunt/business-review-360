/**
 * Issue #493 - organizationId application-guard on Comments routes.
 *
 * Companion to commentIdor.test.js (#481, which guards on tenant_id). This
 * suite proves that the new organizationId column is BOTH set on insert and
 * required in WHERE clauses on the comment read and mutation paths. Uses
 * SQLite so RLS is absent by construction; any cross-tenant read or write
 * that succeeds is a route-layer failure, not RLS.
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

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-comment-org-id-tests';

const tenant1Id = '11111111-1111-1111-1111-111111111111';
const tenant2Id = '22222222-2222-2222-2222-222222222222';
const org1Handle = 'org-one';
const org2Handle = 'org-two';

const user1AdminId = 201;
const user2AdminId = 202;

const user1AdminToken = jwt.sign(
  { id: user1AdminId, username: 'org1admin', isAdmin: true, organizationId: org1Handle },
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

describe('Issue #493 - Comments.organizationId persisted on insert', () => {
  it('POST /api/comments/idea/:ideaId stores organizationId from the authenticated user', async () => {
    const idea = await Idea.create({
      title: 'Idea in org-one',
      authorId: user1AdminId,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    const response = await request(app)
      .post(`/api/comments/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1AdminToken}`)
      .send({ content: 'Hello from org-one' });

    expect(response.status).toBe(201);

    const persisted = await Comment.findByPk(response.body.id);
    expect(persisted).not.toBeNull();
    expect(persisted.organizationId).toBe(org1Handle);
    expect(persisted.tenant_id).toBe(tenant1Id);
  });
});

describe('Issue #493 - Comments read paths filter by organizationId', () => {
  it('GET /api/comments/idea/:ideaId omits comments whose organizationId is mismatched', async () => {
    const idea = await Idea.create({
      title: 'Idea in org-one',
      authorId: user1AdminId,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    // Same ideaId + tenant_id, but a smuggled organizationId belonging to org-two.
    // The application-guard WHERE on organizationId should hide it.
    await Comment.create({
      content: 'Smuggled cross-org comment',
      ideaId: idea.id,
      authorId: user1AdminId,
      editHistory: [],
      isAdminOnly: false,
      organizationId: org2Handle,
      tenant_id: tenant1Id,
    });

    await Comment.create({
      content: 'Legit org-one comment',
      ideaId: idea.id,
      authorId: user1AdminId,
      editHistory: [],
      isAdminOnly: false,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
    });

    const response = await request(app)
      .get(`/api/comments/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1AdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].content).toBe('Legit org-one comment');
  });
});
