/**
 * Tests for HTTP layer of /api/admin/email-analytics routes:
 *   GET  /api/admin/email-analytics              (admin only)
 *   GET  /api/admin/email-analytics/by-type
 *   GET  /api/admin/email-analytics/time-series
 *   GET  /api/admin/email-analytics/logs
 *   GET  /api/admin/email-analytics/logs/:id
 *   GET  /api/admin/email-analytics/health
 *   GET  /api/admin/email-analytics/alerts
 *   POST /api/admin/email-analytics/aggregate
 *   GET  /api/admin/email-analytics/dashboard
 *
 * emailAnalyticsService is fully mocked; auditLog.js is a no-op.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';

const getAnalyticsSummaryMock  = jest.fn();
const getAnalyticsByTypeMock   = jest.fn();
const getTimeSeriesMock        = jest.fn();
const getRecentLogsMock        = jest.fn();
const getEmailLogByIdMock      = jest.fn();
const getHealthCheckMock       = jest.fn();
const getAlertsMock            = jest.fn();
const runDailyAggregationMock  = jest.fn();

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

jest.unstable_mockModule('../../backend/src/services/emailAnalyticsService.js', () => ({
  getAnalyticsSummary:  getAnalyticsSummaryMock,
  getAnalyticsByType:   getAnalyticsByTypeMock,
  getTimeSeries:        getTimeSeriesMock,
  getRecentLogs:        getRecentLogsMock,
  getEmailLogById:      getEmailLogByIdMock,
  getHealthCheck:       getHealthCheckMock,
  getAlerts:            getAlertsMock,
  runDailyAggregation:  runDailyAggregationMock,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-email-analytics-tests';

const adminId   = 'bbbbbbbb-bbbb-4bbb-8bbb-600000000001';
const regularId = 'bbbbbbbb-bbbb-4bbb-8bbb-600000000002';
const orgHandle = 'email-analytics-test-org';

const adminToken = jwt.sign(
  { id: adminId, username: 'analyticsadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'analyticsregular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'analyticsadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'analyticsregular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: emailAnalyticsRoutes } = await import('../../backend/src/routes/emailAnalytics.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/admin/email-analytics', authenticate, emailAnalyticsRoutes);

const sampleSummary = {
  totalSent: 100, deliveryRate: 95.5, openRate: 40.0,
  period: { startDate: '2026-04-15', endDate: '2026-05-15' },
};

beforeEach(() => {
  getAnalyticsSummaryMock.mockReset();
  getAnalyticsByTypeMock.mockReset();
  getTimeSeriesMock.mockReset();
  getRecentLogsMock.mockReset();
  getEmailLogByIdMock.mockReset();
  getHealthCheckMock.mockReset();
  getAlertsMock.mockReset();
  runDailyAggregationMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics', () => {
  it('returns 200 with analytics summary for an admin', async () => {
    getAnalyticsSummaryMock.mockResolvedValueOnce(sampleSummary);

    const res = await request(app)
      .get('/api/admin/email-analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalSent).toBe(100);
    expect(getAnalyticsSummaryMock).toHaveBeenCalledWith(orgHandle, 30);
  });

  it('passes the ?days query param to the service', async () => {
    getAnalyticsSummaryMock.mockResolvedValueOnce(sampleSummary);

    await request(app)
      .get('/api/admin/email-analytics?days=7')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getAnalyticsSummaryMock).toHaveBeenCalledWith(orgHandle, 7);
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/admin/email-analytics');
    expect(res.status).toBe(401);
  });

  it('returns 500 when the service throws', async () => {
    getAnalyticsSummaryMock.mockRejectedValueOnce(new Error('Service error'));
    const res = await request(app)
      .get('/api/admin/email-analytics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics/by-type
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics/by-type', () => {
  it('returns 200 with emailTypes array for an admin', async () => {
    getAnalyticsByTypeMock.mockResolvedValueOnce([{ type: 'welcome', sent: 20 }]);

    const res = await request(app)
      .get('/api/admin/email-analytics/by-type')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.emailTypes)).toBe(true);
    expect(res.body.emailTypes[0].type).toBe('welcome');
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics/by-type')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics/time-series
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics/time-series', () => {
  it('returns 200 with data array for an admin', async () => {
    getTimeSeriesMock.mockResolvedValueOnce([{ date: '2026-05-14', sent: 5 }]);

    const res = await request(app)
      .get('/api/admin/email-analytics/time-series')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(getTimeSeriesMock).toHaveBeenCalledWith(orgHandle, 30, null);
  });

  it('passes the optional type filter to the service', async () => {
    getTimeSeriesMock.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/email-analytics/time-series?type=welcome')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getTimeSeriesMock).toHaveBeenCalledWith(orgHandle, 30, 'welcome');
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics/time-series')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics/logs
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics/logs', () => {
  it('returns 200 with logs array for an admin', async () => {
    getRecentLogsMock.mockResolvedValueOnce([{ id: 'log-1', type: 'welcome' }]);

    const res = await request(app)
      .get('/api/admin/email-analytics/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(getRecentLogsMock).toHaveBeenCalledWith(
      orgHandle, 100, expect.any(Object)
    );
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics/logs')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics/logs/:id
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics/logs/:id', () => {
  it('returns 200 with log detail when found', async () => {
    getEmailLogByIdMock.mockResolvedValueOnce({ id: 'log-1', type: 'welcome', status: 'sent' });

    const res = await request(app)
      .get('/api/admin/email-analytics/logs/log-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('log-1');
    expect(getEmailLogByIdMock).toHaveBeenCalledWith('log-1', orgHandle);
  });

  it('returns 404 when the log is not found', async () => {
    getEmailLogByIdMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/admin/email-analytics/logs/nonexistent')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics/logs/log-1')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics/health
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics/health', () => {
  it('returns 200 with health status for an admin', async () => {
    getHealthCheckMock.mockResolvedValueOnce({ status: 'healthy', issues: [] });

    const res = await request(app)
      .get('/api/admin/email-analytics/health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(getHealthCheckMock).toHaveBeenCalledWith(orgHandle);
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics/health')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics/alerts
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics/alerts', () => {
  it('returns 200 with alerts array for an admin', async () => {
    getAlertsMock.mockResolvedValueOnce([{ level: 'warning', message: 'High bounce rate' }]);

    const res = await request(app)
      .get('/api/admin/email-analytics/alerts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(getAlertsMock).toHaveBeenCalledWith(orgHandle, 30);
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics/alerts')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/email-analytics/aggregate
// ---------------------------------------------------------------------------

describe('POST /api/admin/email-analytics/aggregate', () => {
  it('returns 200 with success and aggregation result for an admin', async () => {
    runDailyAggregationMock.mockResolvedValueOnce({ aggregated: 50 });

    const res = await request(app)
      .post('/api/admin/email-analytics/aggregate')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Aggregation completed');
    expect(res.body.aggregated).toBe(50);
  });

  it('returns 500 when the aggregation service throws', async () => {
    runDailyAggregationMock.mockRejectedValueOnce(new Error('Aggregation failed'));

    const res = await request(app)
      .post('/api/admin/email-analytics/aggregate')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/email-analytics/aggregate')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/email-analytics/dashboard
// ---------------------------------------------------------------------------

describe('GET /api/admin/email-analytics/dashboard', () => {
  it('returns 200 with all dashboard sections for an admin', async () => {
    getAnalyticsSummaryMock.mockResolvedValueOnce(sampleSummary);
    getAnalyticsByTypeMock.mockResolvedValueOnce([]);
    getTimeSeriesMock.mockResolvedValueOnce([]);
    getAlertsMock.mockResolvedValueOnce([]);
    getRecentLogsMock.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/admin/email-analytics/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.emailTypes).toBeDefined();
    expect(res.body.timeSeries).toBeDefined();
    expect(res.body.alerts).toBeDefined();
    expect(res.body.recentLogs).toBeDefined();
    expect(res.body.period.days).toBe(30);
  });

  it('passes the ?days param to all parallel service calls', async () => {
    getAnalyticsSummaryMock.mockResolvedValueOnce(sampleSummary);
    getAnalyticsByTypeMock.mockResolvedValueOnce([]);
    getTimeSeriesMock.mockResolvedValueOnce([]);
    getAlertsMock.mockResolvedValueOnce([]);
    getRecentLogsMock.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/admin/email-analytics/dashboard?days=14')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getAnalyticsSummaryMock).toHaveBeenCalledWith(orgHandle, 14);
    expect(getAnalyticsByTypeMock).toHaveBeenCalledWith(orgHandle, 14);
  });

  it('returns 403 for a non-admin', async () => {
    const res = await request(app)
      .get('/api/admin/email-analytics/dashboard')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/admin/email-analytics/dashboard');
    expect(res.status).toBe(401);
  });
});
