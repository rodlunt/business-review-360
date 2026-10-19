/**
 * GET /api/internal/ops/metrics tests (#848).
 *
 * Covers the minimal ops dashboard route added to backend/src/routes/internal.js:
 *   - happy path with seeded ErrorEvents/MetricsSamples/EmailQueue rows
 *   - hours query-param validation (1-720)
 *   - platform-owner-only auth posture
 *
 * No test file previously existed for backend/src/routes/internal.js at all
 * (routes/internal.js has zero prior coverage), so this file also adds the
 * general auth-posture assertions the task asked for: 401 with no token,
 * 403 for an authenticated non-owner, 403 for a superuser who is not the
 * platform owner (mirrors testing/backend-tests/consultantRoutes.test.js,
 * which establishes the same owner-vs-superuser distinction for the sibling
 * consultants router).
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'sqlite::memory:';
process.env.PLATFORM_DATABASE_URL = process.env.PLATFORM_DATABASE_URL || 'sqlite::memory:';

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Mocks -- must be registered before any dynamic route import
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../backend/src/models/Consultant.js', () => ({
  default: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/models/ConsultantInvite.js', () => ({
  default: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { count: jest.fn(), findAll: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/models/UserOrganizationMembership.js', () => ({
  default: {
    findOrCreate: jest.fn(),
    destroy: jest.fn(),
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../backend/src/models/CommissionRun.js', () => ({
  default: { findAll: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/models/ConsultantPayment.js', () => ({
  default: { findAll: jest.fn(), create: jest.fn() },
}));

const mockErrorEvent = { findAll: jest.fn(), count: jest.fn() };
jest.unstable_mockModule('../../backend/src/models/ErrorEvent.js', () => ({
  default: mockErrorEvent,
}));

const mockMetricsSample = { findAll: jest.fn() };
jest.unstable_mockModule('../../backend/src/models/MetricsSample.js', () => ({
  default: mockMetricsSample,
}));

const mockEmailQueue = { count: jest.fn() };
jest.unstable_mockModule('../../backend/src/models/EmailQueue.js', () => ({
  default: mockEmailQueue,
}));

jest.unstable_mockModule('../../backend/src/emails/utils/sendEmail.js', () => ({
  sendTemplateEmail: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule(
  '../../backend/src/emails/templates/consultants/ConsultantInviteEmail.jsx',
  () => ({ ConsultantInviteEmail: () => null })
);

jest.unstable_mockModule('../../backend/src/jobs/commissionJob.js', () => ({
  runCommissionJob: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn(),
  AuditLog: { create: jest.fn() },
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
  default: {},
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import User from '../../backend/src/models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-internal-ops-848';
process.env.JWT_SECRET = JWT_SECRET;

const regularUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const superuserId = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';
const platformOwnerId = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000003';
process.env.PLATFORM_OWNER_ID = platformOwnerId;

const regularToken = jwt.sign({ id: regularUserId, organizationId: 'admin-org' }, JWT_SECRET, {
  expiresIn: '1h',
});
const superuserToken = jwt.sign({ id: superuserId, organizationId: 'admin-org' }, JWT_SECRET, {
  expiresIn: '1h',
});
const platformOwnerToken = jwt.sign(
  { id: platformOwnerId, organizationId: 'admin-org' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [regularUserId]: { id: regularUserId, username: 'regular', isSuperuser: false },
  [superuserId]: { id: superuserId, username: 'superuser', isSuperuser: true },
  [platformOwnerId]: { id: platformOwnerId, username: 'owner', isSuperuser: false },
};
jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] ?? null);

const { internalRouter } = await import('../../backend/src/routes/internal.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/internal', authenticate, internalRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/internal/ops/metrics', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    mockErrorEvent.findAll.mockReset();
    mockErrorEvent.count.mockReset();
    mockMetricsSample.findAll.mockReset();
    mockEmailQueue.count.mockReset();
  });

  it('returns errorSeries, queueSeries and totals for the platform owner (happy path)', async () => {
    const now = new Date();
    mockErrorEvent.findAll.mockResolvedValue([
      { createdAt: now },
      { createdAt: new Date(now.getTime() - 60 * 60 * 1000) },
    ]);
    mockErrorEvent.count.mockResolvedValue(2);
    mockMetricsSample.findAll.mockResolvedValue([
      { sampledAt: now, emailQueuePending: 3, emailQueueFailed: 1 },
    ]);
    mockEmailQueue.count.mockImplementation(async ({ where }) => {
      if (where.status === 'pending') return 3;
      if (where.status === 'failed') return 1;
      return 0;
    });

    const res = await request(app)
      .get('/api/internal/ops/metrics')
      .set('Authorization', `Bearer ${platformOwnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('errorSeries');
    expect(res.body).toHaveProperty('queueSeries');
    expect(res.body.totals).toEqual({ errors24h: 2, currentPending: 3, currentFailed: 1 });
    expect(Array.isArray(res.body.errorSeries)).toBe(true);
    // Default window is 24h -> 24 hourly buckets.
    expect(res.body.errorSeries).toHaveLength(24);
    expect(res.body.queueSeries).toEqual([
      { sampledAt: now.toISOString(), pending: 3, failed: 1 },
    ]);
  });

  it('defaults hours to 24 when the query param is omitted', async () => {
    mockErrorEvent.findAll.mockResolvedValue([]);
    mockErrorEvent.count.mockResolvedValue(0);
    mockMetricsSample.findAll.mockResolvedValue([]);
    mockEmailQueue.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/internal/ops/metrics')
      .set('Authorization', `Bearer ${platformOwnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.errorSeries).toHaveLength(24);
  });

  it('honours a valid hours param (e.g. 168 for 7 days)', async () => {
    mockErrorEvent.findAll.mockResolvedValue([]);
    mockErrorEvent.count.mockResolvedValue(0);
    mockMetricsSample.findAll.mockResolvedValue([]);
    mockEmailQueue.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/internal/ops/metrics?hours=168')
      .set('Authorization', `Bearer ${platformOwnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.errorSeries).toHaveLength(168);
  });

  it('returns 400 for hours=0 (below minimum)', async () => {
    const res = await request(app)
      .get('/api/internal/ops/metrics?hours=0')
      .set('Authorization', `Bearer ${platformOwnerToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 for hours=721 (above maximum)', async () => {
    const res = await request(app)
      .get('/api/internal/ops/metrics?hours=721')
      .set('Authorization', `Bearer ${platformOwnerToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-numeric hours param', async () => {
    const res = await request(app)
      .get('/api/internal/ops/metrics?hours=abc')
      .set('Authorization', `Bearer ${platformOwnerToken}`);

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Auth posture. No test file previously covered routes/internal.js, so
  // this establishes the platform-owner-only gate for the router generally,
  // not just this route.
  // -------------------------------------------------------------------------

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/internal/ops/metrics');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a regular authenticated user (not the owner)', async () => {
    const res = await request(app)
      .get('/api/internal/ops/metrics')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 for a superuser who is not the platform owner', async () => {
    const res = await request(app)
      .get('/api/internal/ops/metrics')
      .set('Authorization', `Bearer ${superuserToken}`);
    expect(res.status).toBe(403);
  });
});
