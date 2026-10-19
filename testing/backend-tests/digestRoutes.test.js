/**
 * Tests for HTTP layer of /api/digest routes:
 *   GET  /api/digest/weekly-summary/preview      (any authenticated user)
 *   GET  /api/digest/monthly-summary/preview     (admin only)
 *   GET  /api/digest/quarterly-report/preview    (any authenticated user)
 *   POST /api/digest/send-test                   (admin only)
 *   GET  /api/digest/stats                       (admin only)
 *
 * digestEmailService, renderEmail, and statsService are all mocked.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';

const previewWeeklySummaryMock      = jest.fn();
const previewMonthlySummaryMock     = jest.fn();
const previewQuarterlyReportMock    = jest.fn();
const sendWeeklyUserSummariesMock   = jest.fn();
const sendMonthlyAdminSummariesMock = jest.fn();
const sendQuarterlyReportsMock      = jest.fn();
const renderEmailMock               = jest.fn();

// Stats service functions
const getDateRangesMock                 = jest.fn();
const getOrganizationIdeaStatsMock      = jest.fn();
const getTopContributorsMock            = jest.fn();
const getEngagementMetricsMock          = jest.fn();
const getTotalTimeSavedMock             = jest.fn();
const getPendingReviewCountMock         = jest.fn();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/services/digestEmailService.js', () => ({
  previewWeeklySummary:      previewWeeklySummaryMock,
  previewMonthlySummary:     previewMonthlySummaryMock,
  previewQuarterlyReport:    previewQuarterlyReportMock,
  sendWeeklyUserSummaries:   sendWeeklyUserSummariesMock,
  sendMonthlyAdminSummaries: sendMonthlyAdminSummariesMock,
  sendQuarterlyReports:      sendQuarterlyReportsMock,
}));

jest.unstable_mockModule('../../backend/src/emails/utils/renderEmail.js', () => ({
  renderEmail: renderEmailMock,
}));

// React Email JSX templates resolve via moduleNameMapper to react/jsx-runtime,
// so each .jsx mock factory must export every name digest.js imports or the
// last factory wins. Mirrors the pattern in billingRateLimitAndCache.test.js.
const digestTemplateMock = () => ({
  WeeklyUserSummary: jest.fn(),
  MonthlyAdminSummary: jest.fn(),
  QuarterlyReport: jest.fn(),
});
jest.unstable_mockModule('../../backend/src/emails/templates/digest/WeeklyUserSummary.jsx', digestTemplateMock);
jest.unstable_mockModule('../../backend/src/emails/templates/digest/MonthlyAdminSummary.jsx', digestTemplateMock);
jest.unstable_mockModule('../../backend/src/emails/templates/digest/QuarterlyReport.jsx', digestTemplateMock);

jest.unstable_mockModule('../../backend/src/services/statsService.js', () => ({
  getDateRanges:              getDateRangesMock,
  getOrganizationIdeaStats:   getOrganizationIdeaStatsMock,
  getTopContributors:         getTopContributorsMock,
  getEngagementMetrics:       getEngagementMetricsMock,
  getTotalTimeSaved:          getTotalTimeSavedMock,
  getPendingReviewCount:      getPendingReviewCountMock,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-digest-tests';

const adminId   = 'dddddddd-dddd-4ddd-8ddd-200000000001';
const regularId = 'dddddddd-dddd-4ddd-8ddd-200000000002';
const orgHandle = 'digest-test-org';

const adminToken = jwt.sign(
  { id: adminId, username: 'digestadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'digestregular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'digestadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'digestregular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: digestRoutes } = await import('../../backend/src/routes/digest.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/digest', authenticate, digestRoutes);

const samplePreview = {
  template: 'WeeklyUserSummary',
  props: { userName: 'Test User', weeklyStats: {} },
};

beforeEach(() => {
  previewWeeklySummaryMock.mockReset();
  previewMonthlySummaryMock.mockReset();
  previewQuarterlyReportMock.mockReset();
  sendWeeklyUserSummariesMock.mockReset();
  sendMonthlyAdminSummariesMock.mockReset();
  sendQuarterlyReportsMock.mockReset();
  renderEmailMock.mockReset();
  getDateRangesMock.mockReset();
  getOrganizationIdeaStatsMock.mockReset();
  getTopContributorsMock.mockReset();
  getEngagementMetricsMock.mockReset();
  getTotalTimeSavedMock.mockReset();
  getPendingReviewCountMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/digest/weekly-summary/preview
// ---------------------------------------------------------------------------

describe('GET /api/digest/weekly-summary/preview', () => {
  it('returns 200 with preview data for any authenticated user', async () => {
    previewWeeklySummaryMock.mockResolvedValueOnce(samplePreview);
    renderEmailMock.mockResolvedValueOnce({ html: '<h1>Weekly</h1>', text: 'Weekly' });

    const res = await request(app)
      .get('/api/digest/weekly-summary/preview')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.template).toBe('WeeklyUserSummary');
    expect(res.body.html).toBe('<h1>Weekly</h1>');
  });

  it('calls previewWeeklySummary with user id and org', async () => {
    previewWeeklySummaryMock.mockResolvedValueOnce(samplePreview);
    renderEmailMock.mockResolvedValueOnce({ html: '', text: '' });

    await request(app)
      .get('/api/digest/weekly-summary/preview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(previewWeeklySummaryMock).toHaveBeenCalledWith(adminId, orgHandle);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/digest/weekly-summary/preview');
    expect(res.status).toBe(401);
  });

  it('returns 500 when previewWeeklySummary throws', async () => {
    previewWeeklySummaryMock.mockRejectedValueOnce(new Error('preview failed'));

    const res = await request(app)
      .get('/api/digest/weekly-summary/preview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/digest/monthly-summary/preview (admin only)
// ---------------------------------------------------------------------------

describe('GET /api/digest/monthly-summary/preview', () => {
  it('returns 200 with preview data for an admin', async () => {
    previewMonthlySummaryMock.mockResolvedValueOnce(samplePreview);
    renderEmailMock.mockResolvedValueOnce({ html: '<h1>Monthly</h1>', text: 'Monthly' });

    const res = await request(app)
      .get('/api/digest/monthly-summary/preview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/digest/monthly-summary/preview')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/digest/monthly-summary/preview');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/digest/quarterly-report/preview
// ---------------------------------------------------------------------------

describe('GET /api/digest/quarterly-report/preview', () => {
  it('returns 200 with preview data for any authenticated user', async () => {
    previewQuarterlyReportMock.mockResolvedValueOnce(samplePreview);
    renderEmailMock.mockResolvedValueOnce({ html: '<h1>Quarterly</h1>', text: 'Quarterly' });

    const res = await request(app)
      .get('/api/digest/quarterly-report/preview')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.html).toBe('<h1>Quarterly</h1>');
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/digest/quarterly-report/preview');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/digest/send-test (admin only)
// ---------------------------------------------------------------------------

describe('POST /api/digest/send-test', () => {
  it('sends weekly digest and returns success when type=weekly', async () => {
    sendWeeklyUserSummariesMock.mockResolvedValueOnce({ sent: 3 });

    const res = await request(app)
      .post('/api/digest/send-test')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'weekly' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBe('weekly');
    expect(sendWeeklyUserSummariesMock).toHaveBeenCalledWith(orgHandle);
  });

  it('sends monthly digest when type=monthly', async () => {
    sendMonthlyAdminSummariesMock.mockResolvedValueOnce({ sent: 1 });

    const res = await request(app)
      .post('/api/digest/send-test')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'monthly' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('monthly');
    expect(sendMonthlyAdminSummariesMock).toHaveBeenCalledWith(orgHandle);
  });

  it('sends quarterly digest when type=quarterly', async () => {
    sendQuarterlyReportsMock.mockResolvedValueOnce({ sent: 1 });

    const res = await request(app)
      .post('/api/digest/send-test')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'quarterly' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('quarterly');
    expect(sendQuarterlyReportsMock).toHaveBeenCalledWith(orgHandle);
  });

  it('defaults to weekly when no type is sent', async () => {
    sendWeeklyUserSummariesMock.mockResolvedValueOnce({ sent: 1 });

    const res = await request(app)
      .post('/api/digest/send-test')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('weekly');
  });

  it('returns 400 for an invalid type', async () => {
    const res = await request(app)
      .post('/api/digest/send-test')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'daily' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .post('/api/digest/send-test')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ type: 'weekly' });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/digest/send-test').send({ type: 'weekly' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/digest/stats (admin only)
// ---------------------------------------------------------------------------

describe('GET /api/digest/stats', () => {
  const makeRanges = () => ({
    week:    { start: new Date('2026-05-08'), end: new Date() },
    month:   { start: new Date('2026-04-15'), end: new Date() },
    quarter: { start: new Date('2026-02-15'), end: new Date() },
  });

  it('returns 200 with stats for an admin using default month period', async () => {
    getDateRangesMock.mockReturnValueOnce(makeRanges());
    getOrganizationIdeaStatsMock.mockResolvedValueOnce({ total: 5 });
    getTopContributorsMock.mockResolvedValueOnce([]);
    getEngagementMetricsMock.mockResolvedValueOnce({});
    getTotalTimeSavedMock.mockResolvedValueOnce(120);
    getPendingReviewCountMock.mockResolvedValueOnce(2);

    const res = await request(app)
      .get('/api/digest/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.period).toBe('month');
    expect(res.body.stats.ideas).toEqual({ total: 5 });
    expect(res.body.stats.pendingReviewCount).toBe(2);
  });

  it('uses week range when period=week', async () => {
    getDateRangesMock.mockReturnValueOnce(makeRanges());
    getOrganizationIdeaStatsMock.mockResolvedValueOnce({});
    getTopContributorsMock.mockResolvedValueOnce([]);
    getEngagementMetricsMock.mockResolvedValueOnce({});
    getTotalTimeSavedMock.mockResolvedValueOnce(0);
    getPendingReviewCountMock.mockResolvedValueOnce(0);

    const res = await request(app)
      .get('/api/digest/stats?period=week')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe('week');
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/digest/stats')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/digest/stats');
    expect(res.status).toBe(401);
  });

  it('returns 500 when a stats service function throws', async () => {
    getDateRangesMock.mockReturnValueOnce(makeRanges());
    getOrganizationIdeaStatsMock.mockRejectedValueOnce(new Error('Stats DB error'));

    const res = await request(app)
      .get('/api/digest/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});
