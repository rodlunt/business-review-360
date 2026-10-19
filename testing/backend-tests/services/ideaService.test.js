/**
 * Issue #485, Phase 2 — IdeaService unit tests.
 *
 * Tests service functions directly without HTTP scaffolding.
 * Uses SQLite in-memory (mirroring the pattern from ideasBatch.test.js).
 *
 * Coverage targets per spec:
 *   - parsePaginationParams: pure function, no DB
 *   - getIdeaByIdentifier: NotFoundError + ForbiddenError paths
 *   - createIdea: missing fields validation, ForbiddenError for no org
 *   - updateIdea: ownership guard, NotFoundError
 *   - deleteIdea: ownership guard, NotFoundError
 *   - batchUpdateIdeas: ValidationError paths, cross-tenant isolation
 */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

import User from '../../../backend/src/models/User.js';
import Idea from '../../../backend/src/models/Idea.js';
import Vote from '../../../backend/src/models/Vote.js';
import Comment from '../../../backend/src/models/Comment.js';
import Category from '../../../backend/src/models/Category.js';
import Organization from '../../../backend/src/models/Organization.js';

const Sequelize = User.sequelize.constructor;

// Stub notification emails so tests don't call Resend
jest.unstable_mockModule('../../../backend/src/services/notificationEmailService.js', () => ({
  sendNewIdeaSubmittedEmail: jest.fn(() => Promise.resolve()),
  sendStatusChangeEmail: jest.fn(() => Promise.resolve()),
  sendIdeaImplementedEmail: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  sendUserAccountApprovedEmail: jest.fn(() => Promise.resolve()),
}));

const {
  parsePaginationParams,
  listIdeas,
  getIdeaByIdentifier,
  createIdea,
  updateIdea,
  deleteIdea,
  batchUpdateIdeas,
  MAX_LIMIT,
} = await import('../../../backend/src/services/ideaService.js');

const { ValidationError, NotFoundError, ForbiddenError } = await import(
  '../../../backend/src/services/errors.js'
);

// ── Harness setup ──────────────────────────────────────────────────────────

const ORG_A = 'org-alpha';
const ORG_B = 'org-beta';
const TENANT_A = '11111111-1111-1111-1111-111111111111';

let sequelize;
let adminUser;
let regularUser;
let otherOrgUser;
let ideaA;
let privateIdeaA;

beforeAll(async () => {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

  User.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      username: Sequelize.STRING,
      email: Sequelize.STRING,
      passwordHash: Sequelize.STRING,
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      isSuperuser: { type: Sequelize.BOOLEAN, defaultValue: false },
      isAnonymous: { type: Sequelize.BOOLEAN, defaultValue: false },
      isApproved: { type: Sequelize.BOOLEAN, defaultValue: true },
      organizationId: Sequelize.STRING,
      tenant_id: Sequelize.UUID,
    },
    { sequelize, modelName: 'User', tableName: 'Users' }
  );

  Idea.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      title: Sequelize.STRING,
      description: Sequelize.TEXT,
      category: Sequelize.STRING,
      status: { type: Sequelize.STRING, defaultValue: 'Reviewing' },
      priority: Sequelize.INTEGER,
      isPinned: { type: Sequelize.BOOLEAN, defaultValue: false },
      isPrivate: { type: Sequelize.BOOLEAN, defaultValue: false },
      slug: Sequelize.STRING,
      authorId: Sequelize.UUID,
      organizationId: Sequelize.STRING,
      tenant_id: Sequelize.UUID,
      impactScore: { type: Sequelize.INTEGER, defaultValue: 5 },
      effortScore: { type: Sequelize.INTEGER, defaultValue: 5 },
      wouldSpendOwnMoney: { type: Sequelize.BOOLEAN, defaultValue: false },
      additionalComments: Sequelize.TEXT,
      orgImpact: Sequelize.TEXT,
      fixImpact: Sequelize.TEXT,
      solution: Sequelize.TEXT,
      timeSavedMinutes: Sequelize.INTEGER,
      frequencyCount: Sequelize.INTEGER,
      frequencyPeriod: Sequelize.STRING,
      actualTimeSavedMinutes: Sequelize.INTEGER,
      actualFrequencyCount: Sequelize.INTEGER,
      actualFrequencyPeriod: Sequelize.STRING,
    },
    { sequelize, modelName: 'Idea', tableName: 'Ideas' }
  );

  Vote.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      ideaId: Sequelize.UUID,
      userId: Sequelize.UUID,
    },
    { sequelize, modelName: 'Vote', tableName: 'Votes' }
  );

  Comment.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      content: Sequelize.TEXT,
      ideaId: Sequelize.UUID,
      authorId: Sequelize.UUID,
      isAdminOnly: { type: Sequelize.BOOLEAN, defaultValue: false },
    },
    { sequelize, modelName: 'Comment', tableName: 'Comments' }
  );

  Category.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      name: Sequelize.STRING,
      organizationId: Sequelize.STRING,
      createdBy: Sequelize.UUID,
      tenant_id: Sequelize.UUID,
    },
    { sequelize, modelName: 'Category', tableName: 'Categories' }
  );

  Organization.init(
    {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
      organizationId: { type: Sequelize.STRING, unique: true },
      name: Sequelize.STRING,
    },
    { sequelize, modelName: 'Organization', tableName: 'Organizations' }
  );

  Idea.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
  User.hasMany(Idea, { as: 'ideas', foreignKey: 'authorId' });
  Idea.hasMany(Vote, { as: 'votes', foreignKey: 'ideaId' });
  Idea.hasMany(Comment, { as: 'ideaComments', foreignKey: 'ideaId' });
  Comment.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });
  Vote.belongsTo(Idea, { as: 'idea', foreignKey: 'ideaId' });

  await sequelize.sync({ force: true });

  adminUser = await User.create({
    username: 'adminuser',
    email: 'admin@org-alpha.test',
    passwordHash: 'x',
    isAdmin: true,
    organizationId: ORG_A,
    tenant_id: TENANT_A,
  });

  regularUser = await User.create({
    username: 'regularuser',
    email: 'regular@org-alpha.test',
    passwordHash: 'x',
    isAdmin: false,
    organizationId: ORG_A,
    tenant_id: TENANT_A,
  });

  otherOrgUser = await User.create({
    username: 'otherguser',
    email: 'user@org-beta.test',
    passwordHash: 'x',
    isAdmin: false,
    organizationId: ORG_B,
    tenant_id: TENANT_A,
  });

  ideaA = await Idea.create({
    title: 'Test Idea',
    description: 'A public idea',
    slug: 'test-idea',
    authorId: regularUser.id,
    organizationId: ORG_A,
    tenant_id: TENANT_A,
  });

  privateIdeaA = await Idea.create({
    title: 'Private Idea',
    description: 'A private idea',
    slug: 'private-idea',
    isPrivate: true,
    authorId: regularUser.id,
    organizationId: ORG_A,
    tenant_id: TENANT_A,
  });
});

afterAll(async () => {
  await sequelize.close();
});

// ── parsePaginationParams ──────────────────────────────────────────────────

describe('parsePaginationParams', () => {
  it('returns defaults when query is empty', () => {
    const result = parsePaginationParams({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.sort).toBe('newest');
    expect(result.clamped).toBe(false);
  });

  it('clamps limit above MAX_LIMIT and sets clamped flag', () => {
    const result = parsePaginationParams({ limit: '999' });
    expect(result.limit).toBe(MAX_LIMIT);
    expect(result.clamped).toBe(true);
  });

  it('coerces sub-1 page to 1', () => {
    const result = parsePaginationParams({ page: '0' });
    expect(result.page).toBe(1);
  });

  it('throws ValidationError for unknown sort value', () => {
    expect(() => parsePaginationParams({ sort: 'random' })).toThrow(ValidationError);
  });

  it('accepts all valid sort values without throwing', () => {
    for (const sort of ['trending', 'popular', 'newest', 'oldest']) {
      expect(() => parsePaginationParams({ sort })).not.toThrow();
    }
  });
});

// ── listIdeas ──────────────────────────────────────────────────────────────

describe('listIdeas', () => {
  it('returns only org-scoped ideas', async () => {
    await Idea.create({
      title: 'Org B Idea Cross Tenant',
      description: 'Should not appear',
      slug: 'org-b-idea-cross',
      authorId: otherOrgUser.id,
      organizationId: ORG_B,
      tenant_id: TENANT_A,
    });

    const result = await listIdeas(
      { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: true } },
      {}
    );
    const titles = result.ideas.map((i) => i.title);
    expect(titles).not.toContain('Org B Idea Cross Tenant');
    expect(result.ideas.length).toBeGreaterThan(0);
  });

  it('throws ForbiddenError when organizationId is missing', async () => {
    await expect(
      listIdeas({ organizationId: null, user: { id: adminUser.id, isAdmin: true } }, {})
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('hides private ideas from non-owners', async () => {
    const result = await listIdeas(
      { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: false } },
      {}
    );
    const privateVisible = result.ideas.filter(
      (i) => i.isPrivate && i.authorId !== adminUser.id
    );
    expect(privateVisible).toHaveLength(0);
  });

  it('returns pagination metadata', async () => {
    const result = await listIdeas(
      { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: true } },
      { limit: '1', page: '1' }
    );
    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 1,
    });
    expect(typeof result.pagination.totalItems).toBe('number');
  });
});

// ── getIdeaByIdentifier ────────────────────────────────────────────────────

describe('getIdeaByIdentifier', () => {
  it('finds idea by slug', async () => {
    const result = await getIdeaByIdentifier(
      { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: true } },
      'test-idea'
    );
    expect(result.id).toBe(ideaA.id);
  });

  it('finds idea by UUID', async () => {
    const result = await getIdeaByIdentifier(
      { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: true } },
      ideaA.id
    );
    expect(result.id).toBe(ideaA.id);
  });

  it('throws NotFoundError for unknown identifier', async () => {
    await expect(
      getIdeaByIdentifier(
        { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: true } },
        'does-not-exist'
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when non-owner accesses private idea', async () => {
    await expect(
      getIdeaByIdentifier(
        { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: false } },
        'private-idea'
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows owner to access their own private idea', async () => {
    const result = await getIdeaByIdentifier(
      { organizationId: ORG_A, user: { id: regularUser.id, isAdmin: false } },
      'private-idea'
    );
    expect(result.id).toBe(privateIdeaA.id);
  });
});

// ── createIdea ─────────────────────────────────────────────────────────────

describe('createIdea', () => {
  it('creates an idea and returns the instance', async () => {
    const idea = await createIdea(
      { organizationId: ORG_A, user: { id: regularUser.id, username: 'regularuser', isAdmin: false, tenant_id: TENANT_A } },
      { title: 'New Idea', description: 'Some description', isPrivate: false }
    );
    expect(idea.title).toBe('New Idea');
    expect(idea.organizationId).toBe(ORG_A);
  });

  it('throws ValidationError when title is missing', async () => {
    await expect(
      createIdea(
        { organizationId: ORG_A, user: { id: regularUser.id, username: 'regularuser', isAdmin: false, tenant_id: TENANT_A } },
        { description: 'No title' }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ForbiddenError when organizationId is missing', async () => {
    await expect(
      createIdea(
        { organizationId: null, user: { id: regularUser.id, username: 'regularuser', isAdmin: false, tenant_id: TENANT_A } },
        { title: 'T', description: 'D' }
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── updateIdea ─────────────────────────────────────────────────────────────

describe('updateIdea', () => {
  it('allows author to update their own idea', async () => {
    const updated = await updateIdea(
      { organizationId: ORG_A, user: { id: regularUser.id, isAdmin: false, tenant_id: TENANT_A } },
      ideaA.id,
      { title: 'Updated Title' }
    );
    expect(updated.title).toBe('Updated Title');
  });

  it('allows admin to update any idea', async () => {
    const updated = await updateIdea(
      { organizationId: ORG_A, user: { id: adminUser.id, isAdmin: true, tenant_id: TENANT_A } },
      ideaA.id,
      { title: 'Admin Updated' }
    );
    expect(updated.title).toBe('Admin Updated');
  });

  it('throws ForbiddenError for non-owner, non-admin', async () => {
    const thirdUser = await User.create({
      username: 'thirduser',
      email: 'third@org-alpha.test',
      passwordHash: 'x',
      isAdmin: false,
      organizationId: ORG_A,
      tenant_id: TENANT_A,
    });

    await expect(
      updateIdea(
        { organizationId: ORG_A, user: { id: thirdUser.id, isAdmin: false, tenant_id: TENANT_A } },
        ideaA.id,
        { title: 'Hijacked' }
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for missing idea', async () => {
    await expect(
      updateIdea(
        { organizationId: ORG_A, user: { id: regularUser.id, isAdmin: false } },
        '00000000-0000-0000-0000-000000000099',
        { title: 'X' }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── deleteIdea ─────────────────────────────────────────────────────────────

describe('deleteIdea', () => {
  it('allows author to delete their own idea', async () => {
    const toDelete = await Idea.create({
      title: 'To Delete',
      description: 'desc',
      slug: 'to-delete',
      authorId: regularUser.id,
      organizationId: ORG_A,
      tenant_id: TENANT_A,
    });

    const result = await deleteIdea(
      { organizationId: ORG_A, user: { id: regularUser.id, isAdmin: false } },
      toDelete.id
    );
    expect(result.success).toBe(true);
    expect(await Idea.findByPk(toDelete.id)).toBeNull();
  });

  it('throws ForbiddenError when same-org non-owner non-admin tries to delete', async () => {
    const nonOwner = await User.create({
      username: 'nonownerdelete',
      email: 'nonownerdelete@org-alpha.test',
      passwordHash: 'x',
      isAdmin: false,
      organizationId: ORG_A,
      tenant_id: TENANT_A,
    });
    await expect(
      deleteIdea(
        { organizationId: ORG_A, user: { id: nonOwner.id, isAdmin: false } },
        ideaA.id
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when cross-org user references another org idea', async () => {
    await expect(
      deleteIdea(
        { organizationId: ORG_B, user: { id: otherOrgUser.id, isAdmin: true } },
        ideaA.id
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for invalid UUID', async () => {
    await expect(
      deleteIdea({ user: { id: regularUser.id, isAdmin: false } }, 'not-a-uuid')
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── batchUpdateIdeas ───────────────────────────────────────────────────────

describe('batchUpdateIdeas', () => {
  it('throws ValidationError for empty ids array', async () => {
    await expect(
      batchUpdateIdeas({ organizationId: ORG_A }, { ids: [], action: 'setStatus', payload: { status: 'Approved' } })
    ).rejects.toMatchObject({ code: 'INVALID_BATCH_IDS' });
  });

  it('throws ValidationError for invalid action', async () => {
    await expect(
      batchUpdateIdeas({ organizationId: ORG_A }, { ids: [ideaA.id], action: 'badAction', payload: {} })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for invalid status value', async () => {
    await expect(
      batchUpdateIdeas(
        { organizationId: ORG_A },
        { ids: [ideaA.id], action: 'setStatus', payload: { status: 'NotAStatus' } }
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when ids cross org boundary', async () => {
    const orgBIdea = await Idea.create({
      title: 'Org B Idea for Batch',
      description: 'x',
      slug: 'org-b-batch',
      authorId: otherOrgUser.id,
      organizationId: ORG_B,
      tenant_id: TENANT_A,
    });

    await expect(
      batchUpdateIdeas(
        { organizationId: ORG_A },
        { ids: [orgBIdea.id], action: 'setStatus', payload: { status: 'Approved' } }
      )
    ).rejects.toMatchObject({ code: 'BATCH_IDS_NOT_FOUND' });
  });

  it('updates ideas within org successfully', async () => {
    const result = await batchUpdateIdeas(
      { organizationId: ORG_A },
      { ids: [ideaA.id], action: 'setPinned', payload: { isPinned: true } }
    );
    expect(result.updated).toBe(1);
    expect(result.ids).toContain(ideaA.id);

    const reloaded = await Idea.findByPk(ideaA.id);
    expect(reloaded.isPinned).toBe(true);
  });
});
