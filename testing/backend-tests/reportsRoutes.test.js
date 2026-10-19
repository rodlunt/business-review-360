/**
 * Tests for HTTP layer of /api/reports routes:
 *   GET /api/reports/board-report (admin only)
 *
 * All downstream services are mocked so no real PDF/HTML rendering occurs.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';

const getBoardReportMock = jest.fn();
const renderBoardReportPdfMock = jest.fn();
const renderBoardReportMock = jest.fn();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/services/boardReportService.js', () => ({
  getBoardReport: getBoardReportMock,
}));

jest.unstable_mockModule('../../backend/src/services/boardReportPdfService.js', () => ({
  renderBoardReportPdf: renderBoardReportPdfMock,
}));

jest.unstable_mockModule('../../backend/src/utils/renderBoardReport.js', () => ({
  renderBoardReport: renderBoardReportMock,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-reports-tests';

const adminId   = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const regularId = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';
const orgHandle = 'reports-test-org';

const adminToken = jwt.sign(
  { id: adminId, username: 'reportsadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'reportsregular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'reportsadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'reportsregular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: reportsRoutes } = await import('../../backend/src/routes/reports.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/reports', authenticate, reportsRoutes);

const sampleReportData = {
  meta: { organization: { name: 'Test Org', logoUrl: null } },
  topIdeas: [{ id: 1, title: 'Idea A' }],
  recommendations: [{ text: 'Do X' }],
  summary: {},
};

beforeEach(() => {
  getBoardReportMock.mockReset();
  renderBoardReportPdfMock.mockReset();
  renderBoardReportMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/reports/board-report (JSON)
// ---------------------------------------------------------------------------

describe('GET /api/reports/board-report (JSON)', () => {
  it('returns 200 JSON report data for an admin', async () => {
    getBoardReportMock.mockResolvedValueOnce(sampleReportData);

    const res = await request(app)
      .get('/api/reports/board-report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta).toBeDefined();
  });

  it('calls getBoardReport with the correct org and query params', async () => {
    getBoardReportMock.mockResolvedValueOnce(sampleReportData);

    await request(app)
      .get('/api/reports/board-report?period=quarter&hourlyRate=100')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getBoardReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgHandle,
        period: 'quarter',
        hourlyRate: '100',
      })
    );
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/reports/board-report')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/reports/board-report');
    expect(res.status).toBe(401);
  });

  it('returns 500 when getBoardReport throws', async () => {
    getBoardReportMock.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/reports/board-report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/board-report?format=html
// ---------------------------------------------------------------------------

describe('GET /api/reports/board-report?format=html', () => {
  it('returns HTML content with correct Content-Type header', async () => {
    getBoardReportMock.mockResolvedValueOnce(sampleReportData);
    renderBoardReportMock.mockReturnValueOnce('<html><body>Report</body></html>');

    const res = await request(app)
      .get('/api/reports/board-report?format=html')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(renderBoardReportMock).toHaveBeenCalledWith(sampleReportData);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/board-report?format=pdf
// ---------------------------------------------------------------------------

describe('GET /api/reports/board-report?format=pdf', () => {
  it('returns PDF content with correct Content-Type header', async () => {
    getBoardReportMock.mockResolvedValueOnce(sampleReportData);
    renderBoardReportMock.mockReturnValueOnce('<html>pdf content</html>');
    renderBoardReportPdfMock.mockResolvedValueOnce(Buffer.from('PDF-BYTES'));

    const res = await request(app)
      .get('/api/reports/board-report?format=pdf')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(renderBoardReportPdfMock).toHaveBeenCalled();
  });

  it('only allows /uploads/ logoUrl paths to prevent SSRF', async () => {
    const reportWithExternalLogo = {
      ...sampleReportData,
      meta: { organization: { name: 'Org', logoUrl: 'https://evil.com/logo.png' } },
    };
    getBoardReportMock.mockResolvedValueOnce(reportWithExternalLogo);
    renderBoardReportMock.mockReturnValueOnce('<html></html>');
    renderBoardReportPdfMock.mockResolvedValueOnce(Buffer.from('PDF'));

    await request(app)
      .get('/api/reports/board-report?format=pdf')
      .set('Authorization', `Bearer ${adminToken}`);

    // renderBoardReport should have been called with resolvedLogoUrl === null
    const pdfDataArg = renderBoardReportMock.mock.calls[0][0];
    expect(pdfDataArg.meta.organization.logoUrl).toBeNull();
  });

  it('resolves /uploads/ paths to absolute backend URL', async () => {
    const reportWithUploadLogo = {
      ...sampleReportData,
      meta: { organization: { name: 'Org', logoUrl: '/uploads/logo.png' } },
    };
    getBoardReportMock.mockResolvedValueOnce(reportWithUploadLogo);
    renderBoardReportMock.mockReturnValueOnce('<html></html>');
    renderBoardReportPdfMock.mockResolvedValueOnce(Buffer.from('PDF'));

    await request(app)
      .get('/api/reports/board-report?format=pdf')
      .set('Authorization', `Bearer ${adminToken}`);

    const pdfDataArg = renderBoardReportMock.mock.calls[0][0];
    expect(pdfDataArg.meta.organization.logoUrl).toMatch(/^http.*\/uploads\/logo\.png$/);
  });
});
