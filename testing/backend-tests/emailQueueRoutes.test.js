/**
 * Tests for HTTP layer of /api/admin/email-queue routes:
 *   GET    /api/admin/email-queue               (admin only)
 *   GET    /api/admin/email-queue/stats
 *   GET    /api/admin/email-queue/health
 *   GET    /api/admin/email-queue/rate-limit
 *   POST   /api/admin/email-queue/process
 *   POST   /api/admin/email-queue/:id/retry
 *   POST   /api/admin/email-queue/:id/cancel
 *   DELETE /api/admin/email-queue/:id
 *   GET    /api/admin/email-queue/logs
 *   GET    /api/admin/email-queue/logs/stats
 *   GET    /api/admin/email-queue/logs/by-type
 *
 * auditLog.js and emailQueueService.js are mocked.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import EmailQueue from '../../backend/src/models/EmailQueue.js';
import EmailLog from '../../backend/src/models/EmailLog.js';

const getQueueStatsMock       = jest.fn();
const getEmailStatsMock       = jest.fn();
const retryEmailMock          = jest.fn();
const cancelEmailMock         = jest.fn();
const processQueueMock        = jest.fn();
const monitorQueueHealthMock  = jest.fn();
const getRateLimitStatusMock  = jest.fn();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  logAuditEvent: jest.fn(async () => {}),
  AuditLog: { create: jest.fn(async () => ({})) },
  auditLogger: () => (_req, _res, next) => next(),
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
  default: {},
}));

jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  getQueueStats:       getQueueStatsMock,
  getEmailStats:       getEmailStatsMock,
  retryEmail:          retryEmailMock,
  cancelEmail:         cancelEmailMock,
  processQueue:        processQueueMock,
  monitorQueueHealth:  monitorQueueHealthMock,
  getRateLimitStatus:  getRateLimitStatusMock,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-email-queue-tests';

const adminId   = 'aaaaaaaa-aaaa-4aaa-8aaa-500000000001';
const regularId = 'aaaaaaaa-aaaa-4aaa-8aaa-500000000002';
const orgHandle = 'email-queue-test-org';

const adminToken = jwt.sign(
  { id: adminId, username: 'queueadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'queueregular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'queueadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'queueregular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const eqFindAndCountAllSpy = jest.spyOn(EmailQueue, 'findAndCountAll');
const eqFindByPkSpy        = jest.spyOn(EmailQueue, 'findByPk');
const elFindAndCountAllSpy = jest.spyOn(EmailLog, 'findAndCountAll');
const elFindAllSpy         = jest.spyOn(EmailLog, 'findAll');

const { default: emailQueueRoutes } = await import('../../backend/src/routes/emailQueue.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/admin/email-queue', authenticate, emailQueueRoutes);

const makeQueueEntry = (overrides = {}) => ({
  id: 'eq-id-1',
  organizationId: orgHandle,
  type: 'welcome',
  status: 'pending',
  priority: 5,
  scheduledFor: new Date().toISOString(),
  destroy: jest.fn(async () => {}),
  ...overrides,
});

beforeEach(() => {
  eqFindAndCountAllSpy.mockReset();
  eqFindByPkSpy.mockReset();
  elFindAndCountAllSpy.mockReset();
  elFindAllSpy.mockReset();
  getQueueStatsMock.mockReset();
  getEmailStatsMock.mockReset();
  retryEmailMock.mockReset();
  cancelEmailMock.mockReset();
  processQueueMock.mockReset();
  monitorQueueHealthMock.mockReset();
  getRateLimitStatusMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-queue
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-queue', () => {
  it('returns 200 with emails and pagination for an admin', async () => {
    eqFindAndCountAllSpy.mockResolvedValueOnce({ count: 1, rows: [makeQueueEntry()] });

    const res = await request(app)
      .get('/api/admin/email-queue')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.emails)).toBe(true);
    expect(res.body.pagination.total).toBe(1);
  });

  it('applies status, type, and priority filters', async () => {
    eqFindAndCountAllSpy.mockResolvedValueOnce({ count: 0, rows: [] });

    await request(app)
      .get('/api/admin/email-queue?status=pending&type=welcome&priority=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(eqFindAndCountAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'pending', type: 'welcome', priority: 5 }),
      })
    );
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-queue')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/admin/email-queue');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-queue/stats
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-queue/stats', () => {
  it('returns 200 with queue stats for an admin', async () => {
    getQueueStatsMock.mockResolvedValueOnce({ pending: 3, failed: 1 });

    const res = await request(app)
      .get('/api/admin/email-queue/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(3);
    expect(getQueueStatsMock).toHaveBeenCalledWith(orgHandle);
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-queue/stats')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-queue/health
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-queue/health', () => {
  it('returns 200 with health data for an admin', async () => {
    monitorQueueHealthMock.mockResolvedValueOnce({ status: 'healthy', backlog: 0 });

    const res = await request(app)
      .get('/api/admin/email-queue/health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-queue/health')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-queue/rate-limit
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-queue/rate-limit', () => {
  it('returns 200 with rate limit status for an admin', async () => {
    getRateLimitStatusMock.mockReturnValueOnce({ remaining: 100, limit: 200 });

    const res = await request(app)
      .get('/api/admin/email-queue/rate-limit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(100);
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-queue/rate-limit')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/email-queue/process
// ---------------------------------------------------------------------------

describe('POST /api/admin/email-queue/process', () => {
  it('returns 200 with processing result for an admin', async () => {
    processQueueMock.mockResolvedValueOnce({ processed: 5, failed: 0 });

    const res = await request(app)
      .post('/api/admin/email-queue/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ batchSize: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(processQueueMock).toHaveBeenCalledWith(5);
  });

  it('defaults batchSize to 10 when not specified', async () => {
    processQueueMock.mockResolvedValueOnce({ processed: 10, failed: 0 });

    await request(app)
      .post('/api/admin/email-queue/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(processQueueMock).toHaveBeenCalledWith(10);
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/email-queue/process')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/email-queue/:id/retry
// ---------------------------------------------------------------------------

describe('POST /api/admin/email-queue/:id/retry', () => {
  it('returns 200 with retried email for an admin', async () => {
    retryEmailMock.mockResolvedValueOnce({ id: 'eq-id-1', status: 'pending' });

    const res = await request(app)
      .post('/api/admin/email-queue/eq-id-1/retry')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(retryEmailMock).toHaveBeenCalledWith('eq-id-1');
  });

  it('returns 400 when retryEmail throws', async () => {
    retryEmailMock.mockRejectedValueOnce(new Error('Email not in failed state'));

    const res = await request(app)
      .post('/api/admin/email-queue/eq-id-1/retry')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email not in failed state');
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/email-queue/eq-id-1/retry')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/email-queue/:id/cancel
// ---------------------------------------------------------------------------

describe('POST /api/admin/email-queue/:id/cancel', () => {
  it('returns 200 with cancelled email for an admin', async () => {
    cancelEmailMock.mockResolvedValueOnce({ id: 'eq-id-1', status: 'cancelled' });

    const res = await request(app)
      .post('/api/admin/email-queue/eq-id-1/cancel')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(cancelEmailMock).toHaveBeenCalledWith('eq-id-1');
  });

  it('returns 400 when cancelEmail throws', async () => {
    cancelEmailMock.mockRejectedValueOnce(new Error('Can only cancel pending emails'));

    const res = await request(app)
      .post('/api/admin/email-queue/eq-id-1/cancel')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/email-queue/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/email-queue/:id', () => {
  it('deletes a cancelled email and returns success', async () => {
    const entry = makeQueueEntry({ status: 'cancelled' });
    eqFindByPkSpy.mockResolvedValueOnce(entry);

    const res = await request(app)
      .delete('/api/admin/email-queue/eq-id-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(entry.destroy).toHaveBeenCalled();
  });

  it('deletes a failed email and returns success', async () => {
    const entry = makeQueueEntry({ status: 'failed' });
    eqFindByPkSpy.mockResolvedValueOnce(entry);

    const res = await request(app)
      .delete('/api/admin/email-queue/eq-id-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(entry.destroy).toHaveBeenCalled();
  });

  it('returns 404 when the email is not found', async () => {
    eqFindByPkSpy.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/admin/email-queue/eq-id-missing')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 when trying to delete a pending email', async () => {
    const entry = makeQueueEntry({ status: 'pending' });
    eqFindByPkSpy.mockResolvedValueOnce(entry);

    const res = await request(app)
      .delete('/api/admin/email-queue/eq-id-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(entry.destroy).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .delete('/api/admin/email-queue/eq-id-1')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-queue/logs
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-queue/logs', () => {
  it('returns 200 with logs and pagination for an admin', async () => {
    elFindAndCountAllSpy.mockResolvedValueOnce({ count: 2, rows: [{ id: 'log-1' }, { id: 'log-2' }] });

    const res = await request(app)
      .get('/api/admin/email-queue/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.pagination.total).toBe(2);
  });

  it('filters by status and type', async () => {
    elFindAndCountAllSpy.mockResolvedValueOnce({ count: 0, rows: [] });

    await request(app)
      .get('/api/admin/email-queue/logs?status=sent&type=welcome')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(elFindAndCountAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'sent', type: 'welcome' }),
      })
    );
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-queue/logs')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-queue/logs/stats
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-queue/logs/stats', () => {
  it('returns 200 with email delivery stats for an admin', async () => {
    getEmailStatsMock.mockResolvedValueOnce({ total: 100, sent: 90, failed: 10 });

    const res = await request(app)
      .get('/api/admin/email-queue/logs/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(100);
    expect(getEmailStatsMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgHandle })
    );
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-queue/logs/stats')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-queue/logs/by-type
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-queue/logs/by-type', () => {
  it('returns 200 with by-type stats for an admin', async () => {
    elFindAllSpy.mockResolvedValueOnce([
      { type: 'welcome', total: '10', successful: '9', failed: '1', opened: '5' },
    ]);

    const res = await request(app)
      .get('/api/admin/email-queue/logs/by-type')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].type).toBe('welcome');
    expect(typeof res.body[0].successRate).not.toBe('undefined');
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-queue/logs/by-type')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});
