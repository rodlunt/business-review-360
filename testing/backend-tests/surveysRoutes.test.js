/**
 * Tests for HTTP layer of /api/surveys routes:
 *   Public:
 *     GET  /api/surveys/quick-rate  (token-based, no auth)
 *     POST /api/surveys/submit      (token-based, no auth)
 *   Protected:
 *     GET  /api/surveys             (any authenticated user)
 *     GET  /api/surveys/admin       (admin only)
 *     GET  /api/surveys/admin/stats (admin only)
 *
 * Mirrors the dual-router pattern from index.js:
 *   app.use("/api/surveys", surveysPublicRouter)
 *   app.use("/api/surveys", authenticate, surveysProtectedRouter)
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Survey from '../../backend/src/models/Survey.js';
import SurveyToken from '../../backend/src/models/SurveyToken.js';

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/services/engagementEmailService.js', () => ({
  sendSurveyThankYou: jest.fn().mockResolvedValue({}),
  sendEngagementEmail: jest.fn().mockResolvedValue({}),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-surveys-tests';

const adminId   = 'eeeeeeee-eeee-4eee-8eee-300000000001';
const regularId = 'eeeeeeee-eeee-4eee-8eee-300000000002';
const orgHandle = 'surveys-test-org';

const adminToken = jwt.sign(
  { id: adminId, username: 'surveyadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'surveyregular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'surveyadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'surveyregular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const surveyFindAllSpy          = jest.spyOn(Survey, 'findAll');
const surveyFindAndCountAllSpy  = jest.spyOn(Survey, 'findAndCountAll');
const surveyCountSpy            = jest.spyOn(Survey, 'count');
const surveyCreateSpy           = jest.spyOn(Survey, 'create');
const surveyTokenFindOneSpy     = jest.spyOn(SurveyToken, 'findOne');

const {
  publicRouter: surveysPublicRouter,
  protectedRouter: surveysProtectedRouter,
} = await import('../../backend/src/routes/surveys.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/surveys', surveysPublicRouter);
app.use('/api/surveys', authenticate, surveysProtectedRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeToken = (overrides = {}) => ({
  token: 'valid-survey-token',
  userId: regularId,
  organizationId: orgHandle,
  type: 'satisfaction',
  isExpired: jest.fn().mockReturnValue(false),
  isUsed: jest.fn().mockReturnValue(false),
  update: jest.fn(async function (fields) { Object.assign(this, fields); }),
  ...overrides,
});

const makeSurvey = (id = 'survey-id-1') => ({
  id,
  userId: regularId,
  organizationId: orgHandle,
  type: 'satisfaction',
  rating: 4,
  feedback: 'Good!',
  isAnonymous: false,
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  surveyFindAllSpy.mockReset();
  surveyFindAndCountAllSpy.mockReset();
  surveyCountSpy.mockReset();
  surveyCreateSpy.mockReset();
  surveyTokenFindOneSpy.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/surveys/quick-rate (public)
// ---------------------------------------------------------------------------

describe('GET /api/surveys/quick-rate (public)', () => {
  it('creates a survey and redirects to thanks page on a valid token + rating', async () => {
    const tok = makeToken();
    surveyTokenFindOneSpy.mockResolvedValueOnce(tok);
    surveyCreateSpy.mockResolvedValueOnce(makeSurvey());

    const res = await request(app)
      .get('/api/surveys/quick-rate?token=valid-survey-token&rating=4');

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/feedback\/thanks\?rating=4/);
    expect(surveyCreateSpy).toHaveBeenCalled();
    expect(tok.update).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 4 })
    );
  });

  it('returns 400 when no token is provided', async () => {
    const res = await request(app).get('/api/surveys/quick-rate?rating=4');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid rating (out of 1-5 range)', async () => {
    const res = await request(app).get('/api/surveys/quick-rate?token=tok&rating=6');
    expect(res.status).toBe(400);
  });

  it('returns 404 when token is not found', async () => {
    surveyTokenFindOneSpy.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/surveys/quick-rate?token=bad-token&rating=3');
    expect(res.status).toBe(404);
  });

  it('returns 410 when token is expired', async () => {
    const tok = makeToken({ isExpired: jest.fn().mockReturnValue(true) });
    surveyTokenFindOneSpy.mockResolvedValueOnce(tok);
    const res = await request(app).get('/api/surveys/quick-rate?token=expired-token&rating=3');
    expect(res.status).toBe(410);
  });

  it('redirects to thanks?already=true when token is already used', async () => {
    const tok = makeToken({ isUsed: jest.fn().mockReturnValue(true) });
    surveyTokenFindOneSpy.mockResolvedValueOnce(tok);
    const res = await request(app).get('/api/surveys/quick-rate?token=used-token&rating=3');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/already=true/);
  });
});

// ---------------------------------------------------------------------------
// POST /api/surveys/submit (public)
// ---------------------------------------------------------------------------

describe('POST /api/surveys/submit (public)', () => {
  it('returns 200 with surveyId on a valid submission', async () => {
    const tok = makeToken();
    surveyTokenFindOneSpy.mockResolvedValueOnce(tok);
    surveyCreateSpy.mockResolvedValueOnce({ ...makeSurvey(), id: 'new-survey-id' });

    const res = await request(app)
      .post('/api/surveys/submit')
      .send({ token: 'valid-survey-token', rating: 5, feedback: 'Great!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.surveyId).toBe('new-survey-id');
  });

  it('returns 400 when no token is sent', async () => {
    const res = await request(app).post('/api/surveys/submit').send({ rating: 4 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when token is not found', async () => {
    surveyTokenFindOneSpy.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/surveys/submit')
      .send({ token: 'bad-token', rating: 4 });
    expect(res.status).toBe(404);
  });

  it('returns 410 when token is expired', async () => {
    const tok = makeToken({ isExpired: jest.fn().mockReturnValue(true) });
    surveyTokenFindOneSpy.mockResolvedValueOnce(tok);
    const res = await request(app)
      .post('/api/surveys/submit')
      .send({ token: 'expired', rating: 4 });
    expect(res.status).toBe(410);
  });

  it('creates survey with userId null when isAnonymous is true', async () => {
    const tok = makeToken();
    surveyTokenFindOneSpy.mockResolvedValueOnce(tok);
    surveyCreateSpy.mockResolvedValueOnce({ ...makeSurvey(), userId: null });

    await request(app)
      .post('/api/surveys/submit')
      .send({ token: 'valid-survey-token', rating: 3, isAnonymous: true });

    expect(surveyCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, isAnonymous: true })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/surveys (protected — any authenticated user)
// ---------------------------------------------------------------------------

describe('GET /api/surveys (protected)', () => {
  it('returns 200 with surveys array for a regular user', async () => {
    surveyFindAllSpy.mockResolvedValueOnce([makeSurvey()]);

    const res = await request(app)
      .get('/api/surveys')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.surveys)).toBe(true);
    expect(res.body.surveys).toHaveLength(1);
  });

  it('queries only the calling user\'s surveys', async () => {
    surveyFindAllSpy.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/surveys')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(surveyFindAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: regularId } })
    );
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/surveys');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/surveys/admin (admin only)
// ---------------------------------------------------------------------------

describe('GET /api/surveys/admin (admin only)', () => {
  it('returns 200 with surveys and pagination for an admin', async () => {
    surveyFindAndCountAllSpy.mockResolvedValueOnce({ count: 1, rows: [makeSurvey()] });

    const res = await request(app)
      .get('/api/surveys/admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(Array.isArray(res.body.surveys)).toBe(true);
  });

  it('filters by type when ?type= is provided', async () => {
    surveyFindAndCountAllSpy.mockResolvedValueOnce({ count: 0, rows: [] });

    await request(app)
      .get('/api/surveys/admin?type=nps')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(surveyFindAndCountAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'nps' }) })
    );
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/surveys/admin')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/surveys/admin');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/surveys/admin/stats (admin only)
// ---------------------------------------------------------------------------

describe('GET /api/surveys/admin/stats (admin only)', () => {
  const sampleRatingRow = { rating: 4, count: '5', id: '1' };
  const sampleAllRatings = [
    { rating: 4 }, { rating: 5 }, { rating: 3 }, { rating: 4 }, { rating: 2 },
  ];
  const sampleFeedback = [{ id: '1', rating: 4, feedback: 'Good', createdAt: new Date(), isAnonymous: false, User: { username: 'user1' } }];

  it('returns 200 with stats object for an admin', async () => {
    surveyFindAllSpy
      .mockResolvedValueOnce([sampleRatingRow])   // ratingDistribution
      .mockResolvedValueOnce(sampleAllRatings)    // allRatings
      .mockResolvedValueOnce(sampleFeedback);     // recentFeedback
    surveyCountSpy.mockResolvedValueOnce(2);      // feedbackCount

    const res = await request(app)
      .get('/api/surveys/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.averageRating).toBe('number');
    expect(typeof res.body.nps).toBe('number');
    expect(res.body.totalResponses).toBe(5);
    expect(res.body.feedbackCount).toBe(2);
  });

  it('uses default type=satisfaction and period=90 when not specified', async () => {
    surveyFindAllSpy.mockResolvedValue([]);
    surveyCountSpy.mockResolvedValueOnce(0);

    const res = await request(app)
      .get('/api/surveys/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('satisfaction');
    expect(res.body.period).toBe('90 days');
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/surveys/admin/stats')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/surveys/admin/stats');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant data isolation
// ---------------------------------------------------------------------------

describe('surveys -- cross-tenant data isolation', () => {
  it('GET /api/surveys scopes findAll to the calling user\'s own id', async () => {
    surveyFindAllSpy.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/surveys')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(surveyFindAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: regularId } })
    );
  });

  it('GET /api/surveys/admin scopes findAndCountAll to the calling user\'s organisation', async () => {
    surveyFindAndCountAllSpy.mockResolvedValueOnce({ count: 0, rows: [] });

    await request(app)
      .get('/api/surveys/admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(surveyFindAndCountAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgHandle }),
      })
    );
  });

  it('GET /api/surveys/admin/stats scopes all queries to the calling user\'s organisation', async () => {
    surveyFindAllSpy.mockResolvedValue([]);
    surveyCountSpy.mockResolvedValueOnce(0);

    await request(app)
      .get('/api/surveys/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    // Every Survey.findAll call must include organizationId
    for (const call of surveyFindAllSpy.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: orgHandle }) })
      );
    }
  });
});
