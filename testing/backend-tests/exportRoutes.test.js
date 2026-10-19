/**
 * Tests for HTTP layer of /api/export routes:
 *   GET /api/export/excel   (superuser only)
 *   GET /api/export/csv     (superuser only)
 *   GET /api/export/json    (superuser only)
 *   GET /api/export/tickets (superuser only)
 *
 * Model static methods are spied to return empty arrays; ExcelJS and
 * csv-stringify run naturally. The test verifies auth gating and
 * Content-Type headers.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Idea from '../../backend/src/models/Idea.js';
import Comment from '../../backend/src/models/Comment.js';
import Vote from '../../backend/src/models/Vote.js';

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-export-tests';

const superuserId = 'ffffffff-ffff-4fff-8fff-400000000001';
const adminId     = 'ffffffff-ffff-4fff-8fff-400000000002';
const orgHandle   = 'export-test-org';

// requireSuperuser checks req.user.isSuperuser
const superuserToken = jwt.sign(
  { id: superuserId, username: 'exportsuperuser', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// Non-superuser admin (should be rejected by requireSuperuser)
const adminToken = jwt.sign(
  { id: adminId, username: 'exportadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [superuserId]: { id: superuserId, username: 'exportsuperuser', isAdmin: true, isSuperuser: true, organizationId: orgHandle },
  [adminId]:     { id: adminId,     username: 'exportadmin',     isAdmin: true, isSuperuser: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const ideaFindAllSpy    = jest.spyOn(Idea, 'findAll');
const commentFindAllSpy = jest.spyOn(Comment, 'findAll');
const voteFindAllSpy    = jest.spyOn(Vote, 'findAll');

const { default: exportRoutes } = await import('../../backend/src/routes/export.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/export', authenticate, exportRoutes);

// Empty idea with the minimum shape needed for export serialisation
const makeIdea = (id = 'idea-id-1') => ({
  id,
  title: 'Test Idea',
  description: 'Desc',
  category: 'product',
  status: 'submitted',
  priority: 'medium',
  isPinned: false,
  orgImpact: '',
  fixImpact: '',
  solution: '',
  additionalComments: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  author: { username: 'testuser' },
  votes: [],
  ideaComments: [],
  toJSON() { return { ...this, toJSON: undefined }; },
});

const makeComment = (id = 'comment-id-1') => ({
  id,
  ideaId: 'idea-id-1',
  content: 'A comment',
  createdAt: new Date().toISOString(),
  author: { username: 'testuser' },
  idea: { organizationId: orgHandle },
  toJSON() { return { ...this, toJSON: undefined }; },
});

const makeVote = (id = 'vote-id-1') => ({
  id,
  ideaId: 'idea-id-1',
  createdAt: new Date().toISOString(),
  user: { username: 'testuser' },
  idea: { organizationId: orgHandle },
  toJSON() { return { ...this, toJSON: undefined }; },
});

beforeEach(() => {
  ideaFindAllSpy.mockReset();
  commentFindAllSpy.mockReset();
  voteFindAllSpy.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/export/excel (superuser only)
// ---------------------------------------------------------------------------

describe('GET /api/export/excel (superuser only)', () => {
  it('returns 200 with Excel Content-Type for a superuser', async () => {
    ideaFindAllSpy.mockResolvedValueOnce([]);
    commentFindAllSpy.mockResolvedValueOnce([]);
    voteFindAllSpy.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/export/excel')
      .set('Authorization', `Bearer ${superuserToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
  });

  it('returns 403 when called by an admin without superuser', async () => {
    const res = await request(app)
      .get('/api/export/excel')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/export/excel');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/export/csv (superuser only)
// ---------------------------------------------------------------------------

describe('GET /api/export/csv (superuser only)', () => {
  it('returns 200 with CSV Content-Type for a superuser', async () => {
    ideaFindAllSpy.mockResolvedValueOnce([makeIdea()]);

    const res = await request(app)
      .get('/api/export/csv')
      .set('Authorization', `Bearer ${superuserToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/business_review_ideas\.csv/);
  });

  it('returns 200 with empty CSV when there are no ideas', async () => {
    ideaFindAllSpy.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/export/csv')
      .set('Authorization', `Bearer ${superuserToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 without superuser', async () => {
    const res = await request(app)
      .get('/api/export/csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/export/csv');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/export/json (superuser only)
// ---------------------------------------------------------------------------

describe('GET /api/export/json (superuser only)', () => {
  it('returns 200 with JSON Content-Type and export structure for a superuser', async () => {
    ideaFindAllSpy.mockResolvedValueOnce([makeIdea()]);

    const res = await request(app)
      .get('/api/export/json')
      .set('Authorization', `Bearer ${superuserToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/business_review_ideas\.json/);
    expect(typeof res.body.totalIdeas).toBe('number');
    expect(Array.isArray(res.body.ideas)).toBe(true);
    expect(res.body.exportDate).toBeDefined();
  });

  it('returns 403 without superuser', async () => {
    const res = await request(app)
      .get('/api/export/json')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/export/json');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/export/tickets (superuser only)
// ---------------------------------------------------------------------------

describe('GET /api/export/tickets (superuser only)', () => {
  it('returns 200 with ticket JSON and correct disposition header for a superuser', async () => {
    ideaFindAllSpy.mockResolvedValueOnce([makeIdea()]);

    const res = await request(app)
      .get('/api/export/tickets')
      .set('Authorization', `Bearer ${superuserToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/business_review_tickets\.json/);
    // Ticket export is a JSON array
    expect(Array.isArray(JSON.parse(res.text))).toBe(true);
  });

  it('returns 403 without superuser', async () => {
    const res = await request(app)
      .get('/api/export/tickets')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/export/tickets');
    expect(res.status).toBe(401);
  });
});
