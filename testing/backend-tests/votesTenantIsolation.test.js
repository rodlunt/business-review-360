/**
 * Tests for POST /api/votes/idea/:ideaId and DELETE /api/votes/idea/:ideaId.
 *
 * Harness shape mirrors ideasBatch.test.js: in-memory SQLite, User.findByPk
 * spy for authenticate, no profanity/auditLog mocks needed (votes.js imports
 * neither).
 *
 * Key behaviours under test:
 *  - First vote creates a row (201); second vote from same user updates it (200).
 *  - tenant_id on the created Vote row is taken from req.user.tenant_id.
 *  - requireSameOrganization only checks that req.user.organizationId is
 *    present; it does NOT check that the idea belongs to the caller's org
 *    (no organizationId in the votes route URL or body). Cross-org voting
 *    is therefore currently permitted at the route layer.
 *  - DELETE is scoped to userId=req.user.id — user-B cannot delete user-A's vote.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Idea from '../../backend/src/models/Idea.js';
import Vote from '../../backend/src/models/Vote.js';

const Sequelize = User.sequelize.constructor;

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-votes-tests';

const tenant1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenant2Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const org1Handle = 'votes-org-one';
const org2Handle = 'votes-org-two';

const user1Id = 501;
const user2Id = 502;
const org2UserId = 503;

const user1Token = jwt.sign(
  { id: user1Id, username: 'vuser1', isAdmin: false, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const user2Token = jwt.sign(
  { id: user2Id, username: 'vuser2', isAdmin: false, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const org2Token = jwt.sign(
  { id: org2UserId, username: 'vuser3', isAdmin: false, organizationId: org2Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {};
jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: votesRoutes } = await import('../../backend/src/routes/votes.js');
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
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
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
      slug: { type: Sequelize.STRING },
      authorId: { type: Sequelize.INTEGER },
      organizationId: { type: Sequelize.STRING },
      tenant_id: { type: Sequelize.UUID },
      status: { type: Sequelize.STRING, defaultValue: 'Reviewing' },
      isPrivate: { type: Sequelize.BOOLEAN, defaultValue: false },
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

  Vote.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Idea.hasMany(Vote, { as: 'votes', foreignKey: 'ideaId' });
  Vote.belongsTo(User, { as: 'user', foreignKey: 'userId' });
  Idea.belongsTo(User, { as: 'author', foreignKey: 'authorId' });

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/votes', authenticate, votesRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

async function seedIdea({ organizationId, tenant_id, authorId }) {
  const rand = Math.random().toString(36).slice(2, 8);
  return Idea.create({
    title: `Idea ${rand}`,
    slug: `idea-${rand}`,
    authorId,
    organizationId,
    tenant_id,
  });
}

beforeEach(async () => {
  await Vote.destroy({ where: {}, truncate: true });
  await Idea.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  const user1 = {
    id: user1Id, username: 'vuser1', email: 'vuser1@test.com',
    isAdmin: false, isApproved: true, organizationId: org1Handle, tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };
  const user2 = {
    id: user2Id, username: 'vuser2', email: 'vuser2@test.com',
    isAdmin: false, isApproved: true, organizationId: org1Handle, tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };
  const org2User = {
    id: org2UserId, username: 'vuser3', email: 'vuser3@test.com',
    isAdmin: false, isApproved: true, organizationId: org2Handle, tenant_id: tenant2Id,
    toJSON() { return { ...this }; },
  };

  testUsers[user1Id] = user1;
  testUsers[user2Id] = user2;
  testUsers[org2UserId] = org2User;

  await User.create({ ...user1 });
  await User.create({ ...user2 });
  await User.create({ ...org2User });
});

// ---------------------------------------------------------------------------
// POST /api/votes/idea/:ideaId
// ---------------------------------------------------------------------------

describe('POST /api/votes/idea/:ideaId: happy path', () => {
  it('creates a vote and returns 201 when the user has not voted before', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const res = await request(app)
      .post(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(201);
    expect(res.body.ideaId).toBe(idea.id);
    expect(res.body.userId).toBe(user1Id);
    expect(res.body.value).toBe(1);
  });

  it('persists the correct tenant_id from the voter, not from the idea', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    await request(app)
      .post(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    const vote = await Vote.findOne({ where: { ideaId: idea.id, userId: user1Id } });
    expect(vote.tenant_id).toBe(tenant1Id);
  });

  it('returns 200 and updates the vote (no duplicate row) when the user votes again', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    // First vote
    const first = await request(app)
      .post(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);
    expect(first.status).toBe(201);

    // Second vote from same user
    const second = await request(app)
      .post(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);
    expect(second.status).toBe(200);

    // Still only one row
    const count = await Vote.count({ where: { ideaId: idea.id, userId: user1Id } });
    expect(count).toBe(1);
  });

  it('two different users each get their own vote row', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    await request(app)
      .post(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    await request(app)
      .post(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user2Token}`);

    const count = await Vote.count({ where: { ideaId: idea.id } });
    expect(count).toBe(2);
  });
});

describe('POST /api/votes/idea/:ideaId: auth failures', () => {
  it('returns 401 when no Authorization header is supplied', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const res = await request(app).post(`/api/votes/idea/${idea.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const res = await request(app)
      .post(`/api/votes/idea/${idea.id}`)
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/votes/idea/:ideaId: tenant isolation note', () => {
  it('allows a user from org-two to vote on an org-one idea (requireSameOrganization does not check idea ownership)', async () => {
    // This test documents current behaviour: requireSameOrganization only
    // checks that req.user.organizationId is present. Since the votes URL
    // has no organizationId param/query/body, cross-org votes are permitted
    // at the route layer. The Vote row is stamped with the voter's tenant_id.
    const org1Idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const res = await request(app)
      .post(`/api/votes/idea/${org1Idea.id}`)
      .set('Authorization', `Bearer ${org2Token}`);

    expect(res.status).toBe(201);
    const vote = await Vote.findOne({ where: { ideaId: org1Idea.id, userId: org2UserId } });
    expect(vote.tenant_id).toBe(tenant2Id);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/votes/idea/:ideaId
// ---------------------------------------------------------------------------

describe('DELETE /api/votes/idea/:ideaId: happy path', () => {
  it('returns 200 { success: true } when the user has an existing vote', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });
    await Vote.create({ ideaId: idea.id, userId: user1Id, value: 1, tenant_id: tenant1Id });

    const res = await request(app)
      .delete(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('removes the vote row from the database', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });
    await Vote.create({ ideaId: idea.id, userId: user1Id, value: 1, tenant_id: tenant1Id });

    await request(app)
      .delete(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    const gone = await Vote.findOne({ where: { ideaId: idea.id, userId: user1Id } });
    expect(gone).toBeNull();
  });
});

describe('DELETE /api/votes/idea/:ideaId: not found', () => {
  it('returns 404 when the user has no vote for the idea', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const res = await request(app)
      .delete(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Vote not found');
  });

  it('returns 404 for a completely non-existent ideaId', async () => {
    const res = await request(app)
      .delete('/api/votes/idea/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/votes/idea/:ideaId: auth failures', () => {
  it('returns 401 when no Authorization header is supplied', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const res = await request(app).delete(`/api/votes/idea/${idea.id}`);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/votes/idea/:ideaId: cross-user isolation', () => {
  it('user-2 cannot delete user-1 vote — returns 404 (Vote.findOne filters by userId)', async () => {
    const idea = await seedIdea({ organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });
    await Vote.create({ ideaId: idea.id, userId: user1Id, value: 1, tenant_id: tenant1Id });

    const res = await request(app)
      .delete(`/api/votes/idea/${idea.id}`)
      .set('Authorization', `Bearer ${user2Token}`);

    expect(res.status).toBe(404);

    // User-1 vote still exists
    const stillThere = await Vote.findOne({ where: { ideaId: idea.id, userId: user1Id } });
    expect(stillThere).not.toBeNull();
  });
});
