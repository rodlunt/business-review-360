/**
 * Tests for HTTP layer of /api/notifications routes:
 *   GET  /api/notifications/preferences
 *   PUT  /api/notifications/preferences
 *   POST /api/notifications/preferences/reset
 *   GET  /api/notifications/subscriptions
 *   GET  /api/notifications/ideas/:ideaId/subscription
 *   POST /api/notifications/ideas/:ideaId/subscribe
 *   POST /api/notifications/ideas/:ideaId/unsubscribe
 *
 * Harness notes:
 *  - Model static methods (findOrCreate, findAll, findOne, findByPk, destroy, create)
 *    are all spied so no SQLite tables or associations are needed.
 *  - JWTs carry no jti so authenticate skips the UserSession revocation lookup.
 *  - requireSameOrganization is a no-op for these routes (no :organizationId param).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import NotificationPreferences from '../../backend/src/models/NotificationPreferences.js';
import IdeaSubscription from '../../backend/src/models/IdeaSubscription.js';
import Idea from '../../backend/src/models/Idea.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-notif-routes-tests';

const adminId   = 'dddddddd-dddd-4ddd-8ddd-000000000001';
const regularId = 'dddddddd-dddd-4ddd-8ddd-000000000002';
const orgHandle = 'notif-test-org';
const validIdeaId   = 'eeeeeeee-eeee-4eee-8eee-000000000001';

const adminToken = jwt.sign(
  { id: adminId, username: 'notifadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'notifregular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'notifadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'notifregular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

// ---------------------------------------------------------------------------
// Model mock helpers
// ---------------------------------------------------------------------------

const makePrefs = (userId = adminId, overrides = {}) => ({
  id: 'pref-id-1',
  userId,
  emailFrequency: 'realtime',
  commentsOnIdeas: true,
  repliesToComments: true,
  statusChanges: true,
  ideaImplemented: true,
  newIdeas: false,
  weeklySummary: true,
  monthlyReports: true,
  engagementEmails: true,
  globalUnsubscribe: false,
  adminNewIdeas: false,
  adminNeedsAttention: false,
  adminMonthlySummary: false,
  ...overrides,
  update: jest.fn(async function (fields) { Object.assign(this, fields); }),
  toJSON() {
    const { update, toJSON: _t, ...rest } = this;
    void update; void _t;
    return rest;
  },
});

const makeSub = (ideaId = validIdeaId, subscribed = true) => ({
  id: 'sub-id-1',
  userId: adminId,
  ideaId,
  subscribed,
  update: jest.fn(async function (fields) { Object.assign(this, fields); }),
  toJSON() { return { id: this.id, userId: this.userId, ideaId: this.ideaId, subscribed: this.subscribed }; },
});

// Spies - set up after helpers are defined, before route import
const npFindOrCreate = jest.spyOn(NotificationPreferences, 'findOrCreate');
const npDestroy      = jest.spyOn(NotificationPreferences, 'destroy');
const npCreate       = jest.spyOn(NotificationPreferences, 'create');
const isFind         = jest.spyOn(IdeaSubscription, 'findAll');
const isFindOne      = jest.spyOn(IdeaSubscription, 'findOne');
const isFindOrCreate = jest.spyOn(IdeaSubscription, 'findOrCreate');
const ideaFindByPk   = jest.spyOn(Idea, 'findByPk');

const { default: notificationsRoutes } = await import('../../backend/src/routes/notifications.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/notifications', authenticate, notificationsRoutes);

beforeEach(() => {
  npFindOrCreate.mockReset();
  npDestroy.mockReset();
  npCreate.mockReset();
  isFind.mockReset();
  isFindOne.mockReset();
  isFindOrCreate.mockReset();
  ideaFindByPk.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/notifications/preferences
// ---------------------------------------------------------------------------

describe('GET /api/notifications/preferences', () => {
  it('returns 200 with preferences and isAdmin flag', async () => {
    const prefs = makePrefs(adminId);
    npFindOrCreate.mockResolvedValueOnce([prefs, false]);

    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(adminId);
    expect(res.body.isAdmin).toBe(true);
    expect(res.body.emailFrequency).toBe('realtime');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/notifications/preferences');
    expect(res.status).toBe(401);
  });

  it('returns 500 when findOrCreate throws', async () => {
    npFindOrCreate.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/notifications/preferences
// ---------------------------------------------------------------------------

describe('PUT /api/notifications/preferences', () => {
  it('returns 200 with updated preferences for a regular user', async () => {
    const prefs = makePrefs(regularId);
    npFindOrCreate.mockResolvedValueOnce([prefs, false]);

    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ commentsOnIdeas: false, weeklySummary: false });

    expect(res.status).toBe(200);
    expect(prefs.update).toHaveBeenCalledWith(
      expect.objectContaining({ commentsOnIdeas: false, weeklySummary: false })
    );
  });

  it('allows admin to update admin-only preferences', async () => {
    const prefs = makePrefs(adminId);
    npFindOrCreate.mockResolvedValueOnce([prefs, false]);

    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ adminNewIdeas: true, adminNeedsAttention: false });

    expect(prefs.update).toHaveBeenCalledWith(
      expect.objectContaining({ adminNewIdeas: true, adminNeedsAttention: false })
    );
  });

  it('does not apply admin-only fields when called by a non-admin', async () => {
    const prefs = makePrefs(regularId);
    npFindOrCreate.mockResolvedValueOnce([prefs, false]);

    await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ adminNewIdeas: true });

    const updateArg = prefs.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('adminNewIdeas');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).put('/api/notifications/preferences').send({});
    expect(res.status).toBe(401);
  });

  it('returns 500 when findOrCreate throws', async () => {
    npFindOrCreate.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ commentsOnIdeas: false });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/preferences/reset
// ---------------------------------------------------------------------------

describe('POST /api/notifications/preferences/reset', () => {
  it('returns 200 with default preferences and reset message', async () => {
    const freshPrefs = makePrefs(adminId);
    npDestroy.mockResolvedValueOnce(1);
    npCreate.mockResolvedValueOnce(freshPrefs);

    const res = await request(app)
      .post('/api/notifications/preferences/reset')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Preferences reset to defaults');
    expect(npDestroy).toHaveBeenCalledWith({ where: { userId: adminId } });
    expect(npCreate).toHaveBeenCalledWith({ userId: adminId });
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/notifications/preferences/reset');
    expect(res.status).toBe(401);
  });

  it('returns 500 when destroy throws', async () => {
    npDestroy.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/notifications/preferences/reset')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notifications/subscriptions
// ---------------------------------------------------------------------------

describe('GET /api/notifications/subscriptions', () => {
  it('returns 200 with list of active subscriptions', async () => {
    const sub = makeSub(validIdeaId, true);
    isFind.mockResolvedValueOnce([sub]);

    const res = await request(app)
      .get('/api/notifications/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('queries with subscribed:true filter for the calling user', async () => {
    isFind.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/notifications/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(isFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: adminId, subscribed: true } })
    );
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/notifications/subscriptions');
    expect(res.status).toBe(401);
  });

  it('returns 500 when findAll throws', async () => {
    isFind.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/notifications/subscriptions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notifications/ideas/:ideaId/subscription
// ---------------------------------------------------------------------------

describe('GET /api/notifications/ideas/:ideaId/subscription', () => {
  it('returns 200 { subscribed: true } when subscription exists', async () => {
    isFindOne.mockResolvedValueOnce(makeSub(validIdeaId, true));

    const res = await request(app)
      .get(`/api/notifications/ideas/${validIdeaId}/subscription`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ideaId: validIdeaId, subscribed: true });
  });

  it('returns 200 { subscribed: false } when no subscription row exists', async () => {
    isFindOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/notifications/ideas/${validIdeaId}/subscription`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.subscribed).toBe(false);
  });

  it('returns 404 for a non-UUID ideaId', async () => {
    const res = await request(app)
      .get('/api/notifications/ideas/not-a-uuid/subscription')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .get(`/api/notifications/ideas/${validIdeaId}/subscription`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/ideas/:ideaId/subscribe
// ---------------------------------------------------------------------------

describe('POST /api/notifications/ideas/:ideaId/subscribe', () => {
  it('returns 200 { subscribed: true } when subscribing to a new idea', async () => {
    ideaFindByPk.mockResolvedValueOnce({ id: validIdeaId });
    const sub = makeSub(validIdeaId, true);
    isFindOrCreate.mockResolvedValueOnce([sub, true]);

    const res = await request(app)
      .post(`/api/notifications/ideas/${validIdeaId}/subscribe`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ideaId: validIdeaId, subscribed: true });
  });

  it('re-activates an existing unsubscribed row', async () => {
    ideaFindByPk.mockResolvedValueOnce({ id: validIdeaId });
    const sub = makeSub(validIdeaId, false);
    isFindOrCreate.mockResolvedValueOnce([sub, false]);

    const res = await request(app)
      .post(`/api/notifications/ideas/${validIdeaId}/subscribe`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(sub.update).toHaveBeenCalledWith({ subscribed: true });
  });

  it('returns 404 when idea does not exist', async () => {
    ideaFindByPk.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/notifications/ideas/${validIdeaId}/subscribe`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-UUID ideaId', async () => {
    const res = await request(app)
      .post('/api/notifications/ideas/not-a-uuid/subscribe')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post(`/api/notifications/ideas/${validIdeaId}/subscribe`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notifications/ideas/:ideaId/unsubscribe
// ---------------------------------------------------------------------------

describe('POST /api/notifications/ideas/:ideaId/unsubscribe', () => {
  it('returns 200 { subscribed: false } when unsubscribing', async () => {
    const sub = makeSub(validIdeaId, true);
    isFindOrCreate.mockResolvedValueOnce([sub, false]);

    const res = await request(app)
      .post(`/api/notifications/ideas/${validIdeaId}/unsubscribe`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ideaId: validIdeaId, subscribed: false });
    expect(sub.update).toHaveBeenCalledWith({ subscribed: false });
  });

  it('creates a new row with subscribed:false when no prior subscription exists', async () => {
    const newSub = makeSub(validIdeaId, false);
    isFindOrCreate.mockResolvedValueOnce([newSub, true]);

    const res = await request(app)
      .post(`/api/notifications/ideas/${validIdeaId}/unsubscribe`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.subscribed).toBe(false);
    // created=true means the row was just created with subscribed:false; no update call needed
    expect(newSub.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-UUID ideaId', async () => {
    const res = await request(app)
      .post('/api/notifications/ideas/not-a-uuid/unsubscribe')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post(`/api/notifications/ideas/${validIdeaId}/unsubscribe`);
    expect(res.status).toBe(401);
  });
});
