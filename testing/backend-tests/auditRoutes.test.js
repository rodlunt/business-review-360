/**
 * Tests for HTTP layer of /api/audit routes:
 *   GET /api/audit/logs     (list audit logs, admin only)
 *   GET /api/audit/stats    (audit statistics, admin only)
 *   GET /api/audit/actions  (distinct action types, admin only)
 *
 * Harness notes:
 *  - platformDatabase.js is mocked to avoid PLATFORM_DATABASE_URL -> process.exit(1).
 *  - auditLog.js is mocked so auditLogger passes through and AuditLog.query is controllable.
 *  - JWTs carry no jti so authenticate skips the UserSession revocation lookup.
 *  - User.findByPk is spied to return test user objects without needing a real DB.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';

const auditQueryMock = jest.fn();
const platformQueryMock = jest.fn();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: platformQueryMock },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  logAuditEvent: jest.fn(async () => {}),
  AuditLog: { create: jest.fn(async () => ({})), query: auditQueryMock },
  auditLogger: () => (_req, _res, next) => next(),
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
  default: {},
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-audit-routes-tests';

const adminId   = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const regularId = 'cccccccc-cccc-4ccc-8ccc-000000000002';
const orgHandle = 'audit-test-org';

const adminToken = jwt.sign(
  { id: adminId, username: 'auditadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'auditregular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'auditadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'auditregular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: auditRoutes } = await import('../../backend/src/routes/audit.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/audit', authenticate, auditRoutes);

beforeEach(() => {
  auditQueryMock.mockReset();
  platformQueryMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/audit/logs
// ---------------------------------------------------------------------------

describe('GET /api/audit/logs', () => {
  it('returns 200 with logs array and pagination when called by admin', async () => {
    auditQueryMock.mockResolvedValueOnce([
      { id: 1, action: 'auth.login', actor_id: adminId },
      { id: 2, action: 'ideas.create', actor_id: regularId },
    ]);

    const res = await request(app)
      .get('/api/audit/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ limit: 100, offset: 0, returned: 2 });
  });

  it('passes query filters through to AuditLog.query', async () => {
    auditQueryMock.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/audit/logs?action=auth.login&limit=10&offset=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(auditQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', limit: 10, offset: 5 })
    );
  });

  it('returns 403 FORBIDDEN when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/audit/logs')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/audit/logs');
    expect(res.status).toBe(401);
  });

  it('returns 500 AUDIT_LOG_ERROR when AuditLog.query throws', async () => {
    auditQueryMock.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app)
      .get('/api/audit/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUDIT_LOG_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /api/audit/stats
// ---------------------------------------------------------------------------

describe('GET /api/audit/stats', () => {
  it('returns 200 with stats object when called by admin', async () => {
    platformQueryMock.mockResolvedValueOnce([
      { total_logs: '42', unique_actors: '5', failed_operations: '1', support_accesses: '0', auth_events: '10' },
    ]);

    const res = await request(app)
      .get('/api/audit/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.period_days).toBe(30);
    expect(res.body.stats).toMatchObject({ total_logs: '42', unique_actors: '5' });
  });

  it('respects the ?days query param for period_days in response', async () => {
    platformQueryMock.mockResolvedValueOnce([{ total_logs: '7' }]);

    const res = await request(app)
      .get('/api/audit/stats?days=7')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.period_days).toBe(7);
  });

  it('returns 403 FORBIDDEN when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/audit/stats')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/audit/stats');
    expect(res.status).toBe(401);
  });

  it('returns 500 AUDIT_STATS_ERROR when platformSequelize.query throws', async () => {
    platformQueryMock.mockRejectedValueOnce(new Error('Query failed'));

    const res = await request(app)
      .get('/api/audit/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUDIT_STATS_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /api/audit/actions
// ---------------------------------------------------------------------------

describe('GET /api/audit/actions', () => {
  it('returns 200 with a flat array of action strings when called by admin', async () => {
    platformQueryMock.mockResolvedValueOnce([
      { action: 'auth.login' },
      { action: 'audit.logs.view' },
      { action: 'ideas.create' },
    ]);

    const res = await request(app)
      .get('/api/audit/actions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual(['auth.login', 'audit.logs.view', 'ideas.create']);
  });

  it('returns 403 FORBIDDEN when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/audit/actions')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/audit/actions');
    expect(res.status).toBe(401);
  });

  it('returns 500 AUDIT_ACTIONS_ERROR when platformSequelize.query throws', async () => {
    platformQueryMock.mockRejectedValueOnce(new Error('Timeout'));

    const res = await request(app)
      .get('/api/audit/actions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUDIT_ACTIONS_ERROR');
  });
});
