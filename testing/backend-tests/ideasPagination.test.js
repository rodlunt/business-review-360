/**
 * Issue #568: GET /api/ideas pagination
 *
 * Covers the pagination contract change shipped to fix the hard-coded
 * `limit=10000` regression on the Review Ideas page. The route already
 * accepted `?page` and `?limit` before; this PR raises the default limit
 * to 50, clamps oversized requests to 100 with an `X-RateLimit-Clamp`
 * header, returns `pagination.hasMore`, attaches `trendingScore` to each
 * row, validates `sort` against the locked enum, and pushes ordering for
 * `popular` and `trending` into SQL so pagination is correct across pages.
 *
 * The harness mirrors testing/backend-tests/commentIdor.test.js: a single
 * in-memory SQLite Sequelize is constructed using the class identity that
 * the production model was bound to (`User.sequelize.constructor`), then
 * each model is re-init'd against it. This avoids the experimental-vm-
 * modules class-identity pitfall captured in #670.
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

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-ideas-pagination-tests';

const tenant1Id = '11111111-1111-1111-1111-111111111111';
const tenant2Id = '22222222-2222-2222-2222-222222222222';
const org1Handle = 'org-one';
const org2Handle = 'org-two';

const user1Id = 201;
const user2Id = 202;

const user1Token = jwt.sign(
  { id: user1Id, username: 'org1user', isAdmin: true, organizationId: org1Handle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const user2Token = jwt.sign(
  { id: user2Id, username: 'org2user', isAdmin: true, organizationId: org2Handle },
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
      wouldSpendOwnMoney: { type: Sequelize.BOOLEAN, defaultValue: false },
      orgImpact: { type: Sequelize.TEXT },
      fixImpact: { type: Sequelize.TEXT },
      solution: { type: Sequelize.TEXT },
      additionalComments: { type: Sequelize.TEXT },
      impactScore: { type: Sequelize.INTEGER, defaultValue: 5 },
      effortScore: { type: Sequelize.INTEGER, defaultValue: 5 },
    },
    { sequelize, modelName: 'Idea', tableName: 'Ideas' }
  );

  Vote.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      value: { type: Sequelize.INTEGER, defaultValue: 1 },
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
      isAdminOnly: { type: Sequelize.BOOLEAN, defaultValue: false },
      isEdited: { type: Sequelize.BOOLEAN, defaultValue: false },
      tenant_id: { type: Sequelize.UUID },
    },
    { sequelize, modelName: 'Comment', tableName: 'Comments' }
  );

  Organization.init(
    {
      id: { type: Sequelize.STRING, primaryKey: true },
      name: { type: Sequelize.STRING },
      allowSelfRegistration: { type: Sequelize.BOOLEAN, defaultValue: true },
    },
    { sequelize, modelName: 'Organization', tableName: 'Organizations' }
  );

  // Re-bind associations against the test sqlite instance.
  Idea.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  User.hasMany(Idea, { as: 'ideas', foreignKey: 'authorId' });
  Vote.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Idea.hasMany(Vote, { as: 'votes', foreignKey: 'ideaId' });
  Comment.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  Comment.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Idea.hasMany(Comment, { as: 'ideaComments', foreignKey: 'ideaId' });

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/ideas', authenticate, ideasRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

async function seedIdeas({ count, organizationId, tenant_id, authorId, withVotes = false, prefix = 'Idea' }) {
  const created = [];
  for (let i = 0; i < count; i++) {
    const idea = await Idea.create({
      title: `${prefix} ${i}`,
      description: `Description for ${prefix} ${i}`,
      slug: `${prefix.toLowerCase()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      authorId,
      organizationId,
      tenant_id,
      isPrivate: false,
      isPinned: false,
      status: 'Reviewing',
    });
    if (withVotes && i > 0) {
      // Idea i gets i votes so vote count is monotonically increasing.
      for (let v = 0; v < i; v++) {
        await Vote.create({
          ideaId: idea.id,
          userId: authorId,
          value: 1,
          tenant_id,
        });
      }
    }
    created.push(idea);
  }
  return created;
}

beforeEach(async () => {
  await Vote.destroy({ where: {}, truncate: true });
  await Comment.destroy({ where: {}, truncate: true });
  await Idea.destroy({ where: {}, truncate: true });
  await User.destroy({ where: {}, truncate: true });

  const user1 = {
    id: user1Id,
    username: 'org1user',
    email: 'org1user@test.com',
    isAdmin: true,
    isAnonymous: false,
    organizationId: org1Handle,
    tenant_id: tenant1Id,
    toJSON() { return { ...this }; },
  };

  const user2 = {
    id: user2Id,
    username: 'org2user',
    email: 'org2user@test.com',
    isAdmin: true,
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

describe('GET /api/ideas: query-param parsing', () => {
  it('returns the new default limit of 50 when no params are supplied', async () => {
    await seedIdeas({ count: 60, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toBeDefined();
    expect(response.body.pagination.limit).toBe(50);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.ideas).toHaveLength(50);
  });

  it('clamps limit above the maximum to 100 and sets X-RateLimit-Clamp', async () => {
    await seedIdeas({ count: 120, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?limit=999')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.limit).toBe(100);
    expect(response.body.ideas).toHaveLength(100);
    expect(response.headers['x-ratelimit-clamp']).toBe('limit=100');
  });

  it('does NOT set X-RateLimit-Clamp when limit is within bounds', async () => {
    await seedIdeas({ count: 10, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?limit=10')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.headers['x-ratelimit-clamp']).toBeUndefined();
    expect(response.body.pagination.limit).toBe(10);
  });

  it('clamps a non-positive limit to the minimum of 1', async () => {
    await seedIdeas({ count: 5, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?limit=0')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.limit).toBe(1);
    expect(response.body.ideas).toHaveLength(1);
  });

  it('coerces a non-numeric limit back to the default of 50', async () => {
    await seedIdeas({ count: 60, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?limit=banana')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.limit).toBe(50);
  });

  it('clamps a sub-1 page to 1', async () => {
    await seedIdeas({ count: 5, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?page=0')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.page).toBe(1);
  });

  it('rejects an unknown sort value with a 400 ValidationError', async () => {
    const response = await request(app)
      .get('/api/ideas?sort=banana')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_SORT');
    expect(response.body.error).toMatch(/sort/i);
  });
});

describe('GET /api/ideas: happy path and pagination shape', () => {
  it('returns the documented response envelope with pagination + hasMore', async () => {
    await seedIdeas({ count: 3, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        ideas: expect.any(Array),
        pagination: expect.objectContaining({
          page: 1,
          limit: 50,
          totalItems: 3,
          totalPages: 1,
          hasMore: false,
        }),
      })
    );
    // Each row carries a numeric trendingScore.
    response.body.ideas.forEach((idea) => {
      expect(typeof idea.trendingScore).toBe('number');
    });
  });

  it('reports hasMore=true when more pages remain', async () => {
    await seedIdeas({ count: 60, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?page=1&limit=50')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 50,
        totalItems: 60,
        totalPages: 2,
        hasMore: true,
      })
    );
  });

  it('reports hasMore=false when on the final page', async () => {
    await seedIdeas({ count: 30, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?page=1&limit=50')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.hasMore).toBe(false);
    expect(response.body.pagination.totalPages).toBe(1);
  });
});

describe('GET /api/ideas: edge cases', () => {
  it('returns an empty array with hasMore=false when page is beyond the last', async () => {
    await seedIdeas({ count: 5, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id });

    const response = await request(app)
      .get('/api/ideas?page=999&limit=50')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.ideas).toEqual([]);
    expect(response.body.pagination.hasMore).toBe(false);
    expect(response.body.pagination.page).toBe(999);
    expect(response.body.pagination.totalItems).toBe(5);
  });

  it('returns an empty list with sane pagination when the org has zero ideas', async () => {
    const response = await request(app)
      .get('/api/ideas')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.ideas).toEqual([]);
    expect(response.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 50,
        totalItems: 0,
        totalPages: 0,
        hasMore: false,
      })
    );
  });

  it('returns only the caller\'s organisation rows even when other orgs are seeded', async () => {
    await seedIdeas({ count: 10, organizationId: org1Handle, tenant_id: tenant1Id, authorId: user1Id, prefix: 'OrgOne' });
    await seedIdeas({ count: 10, organizationId: org2Handle, tenant_id: tenant2Id, authorId: user2Id, prefix: 'OrgTwo' });

    const response = await request(app)
      .get('/api/ideas')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.totalItems).toBe(10);
    expect(response.body.ideas).toHaveLength(10);
    response.body.ideas.forEach((idea) => {
      expect(idea.title).toMatch(/^OrgOne/);
    });
  });
});

describe('GET /api/ideas: sort modes', () => {
  it('sort=newest returns the most recently created idea first', async () => {
    const now = Date.now();
    // Seed three ideas with explicit creation timestamps (oldest first so
    // the second entry below is the newest).
    const oldest = await Idea.create({
      title: 'Oldest', description: 'd', slug: `s-old-${now}`,
      authorId: user1Id, organizationId: org1Handle, tenant_id: tenant1Id,
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    });
    const middle = await Idea.create({
      title: 'Middle', description: 'd', slug: `s-mid-${now}`,
      authorId: user1Id, organizationId: org1Handle, tenant_id: tenant1Id,
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
    });
    const newest = await Idea.create({
      title: 'Newest', description: 'd', slug: `s-new-${now}`,
      authorId: user1Id, organizationId: org1Handle, tenant_id: tenant1Id,
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
    });

    const response = await request(app)
      .get('/api/ideas?sort=newest')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    expect(response.body.ideas[0].id).toBe(newest.id);
    expect(response.body.ideas[response.body.ideas.length - 1].id).toBe(oldest.id);
  });

  it('sort=popular orders by recent vote count (server-side)', async () => {
    const ideas = await seedIdeas({
      count: 5,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
      authorId: user1Id,
      withVotes: true,
      prefix: 'Pop',
    });

    const response = await request(app)
      .get('/api/ideas?sort=popular&limit=5')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    // Idea 0 has 0 votes, idea 4 has 4 votes. Server-side ordering by
    // recent vote count puts the most-voted row at index 0.
    expect(response.body.ideas[0].id).toBe(ideas[4].id);
    expect(response.body.ideas[response.body.ideas.length - 1].id).toBe(ideas[0].id);
  });

  it('sort=trending returns rows ordered with each carrying a numeric trendingScore', async () => {
    const ideas = await seedIdeas({
      count: 5,
      organizationId: org1Handle,
      tenant_id: tenant1Id,
      authorId: user1Id,
      withVotes: true,
      prefix: 'Trend',
    });

    const response = await request(app)
      .get('/api/ideas?sort=trending&limit=5')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(response.status).toBe(200);
    response.body.ideas.forEach((idea) => {
      expect(typeof idea.trendingScore).toBe('number');
      expect(idea.trendingScore).toBeGreaterThanOrEqual(0);
    });
    // The idea with the most votes should not be sorted last.
    const ideaIds = response.body.ideas.map((i) => i.id);
    expect(ideaIds).toContain(ideas[4].id);
    // Idea 4 (most votes) should appear before idea 0 (no votes).
    expect(ideaIds.indexOf(ideas[4].id)).toBeLessThan(ideaIds.indexOf(ideas[0].id));
  });
});
