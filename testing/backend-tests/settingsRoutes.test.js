/**
 * Issue #801 -- settings route coverage.
 *
 * Covers the endpoints in settings.js that are NOT already tested by
 * demoDataRoutes.test.js (which owns POST/DELETE /demo-data):
 *
 *   Public:
 *     GET  /api/settings/organization/:organizationId/public
 *
 *   Protected (superuser):
 *     POST /api/settings/                             (update settings)
 *     GET  /api/settings/organization/:organizationId (full settings)
 *     PATCH /api/settings/setup-wizard
 *     POST /api/settings/upload-logo
 *     DELETE /api/settings/logo
 *
 * Auth / guard checks per endpoint:
 *   - 401 without token
 *   - 403 for non-superuser where requireSuperuser is in chain
 *   - 403 TENANT_MISMATCH when organizationId in request disagrees with JWT
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mocks -- registered BEFORE any route imports
// ---------------------------------------------------------------------------

let authBehaviour = { mode: 'allow', isAdmin: true, isSuperuser: true, organizationId: 'settings-test-org' };
let uploadFileBehaviour = null; // set per-test to inject req.file into upload mock

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (authBehaviour.mode === 'reject') {
      return res.status(401).json({ error: 'No token provided' });
    }
    req.user = {
      id: 'user-uuid-1',
      username: 'su-user',
      isAdmin: authBehaviour.isAdmin,
      isSuperuser: authBehaviour.isSuperuser ?? authBehaviour.isAdmin,
      organizationId: authBehaviour.organizationId,
    };
    next();
  },
  requireSameOrganization: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const requested =
      (req.params && req.params.organizationId) ||
      (req.query && req.query.organizationId) ||
      (req.body && req.body.organizationId);
    if (requested && req.user.organizationId !== requested) {
      return res.status(403).json({
        error: "You do not have access to this organisation's data.",
        code: 'TENANT_MISMATCH',
      });
    }
    next();
  },
  requireAdmin: (req, res, next) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
  },
  requireSuperuser: (req, res, next) => {
    if (!req.user?.isSuperuser) return res.status(403).json({ error: 'Superuser access required' });
    next();
  },
  generateToken: jest.fn(),
}));

const orgFindOneMock = jest.fn();
const orgUpdateMock = jest.fn().mockResolvedValue([1]);

jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { findOne: orgFindOneMock, update: orgUpdateMock },
}));

const storageAdapterSaveMock = jest.fn().mockResolvedValue(undefined);
const storageAdapterDeleteMock = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../backend/src/middleware/upload.js', () => ({
  default: {
    single: () => (req, res, next) => {
      if (uploadFileBehaviour) req.file = uploadFileBehaviour;
      next();
    },
  },
  storageAdapter: { save: storageAdapterSaveMock, delete: storageAdapterDeleteMock },
}));

jest.unstable_mockModule('../../backend/src/middleware/validateFileMagicBytes.js', () => ({
  validateFileMagicBytes: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../backend/src/middleware/profanityFilter.js', () => ({
  validateText: jest.fn().mockResolvedValue({ isValid: true }),
  invalidateSettingsCache: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  auditLogger: () => (req, res, next) => next(),
  redactForAudit: (obj) => obj,
}));

jest.unstable_mockModule('../../backend/src/services/demoDataService.js', () => ({
  loadDemoData: jest.fn(),
  removeDemoData: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/utils/formatServerError.js', () => ({
  formatServerError: (err, msg) => ({ error: msg, details: err.message }),
}));

jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Import routers after mocks
// ---------------------------------------------------------------------------

const { publicRouter: settingsPublic, protectedRouter: settingsProtected } = await import(
  '../../backend/src/routes/settings.js'
);
const { authenticate } = await import('../../backend/src/middleware/auth.js');
const { validateText } = await import('../../backend/src/middleware/profanityFilter.js');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = { id: 'tenant-uuid-1', org_id: 'settings-test-org' };
    next();
  });
  app.use('/api/settings', settingsPublic);
  app.use('/api/settings', authenticate, settingsProtected);
});

const makeOrg = (overrides = {}) => ({
  id: 'org-db-id-1',
  organizationId: 'settings-test-org',
  organizationName: 'Test Org',
  organizationDescription: 'A test org',
  primaryColor: '#4a90e2',
  logoUrl: null,
  logoHighContrast: false,
  bigQuestion: null,
  useCaptcha: false,
  allowAnonymousIdeas: false,
  requireApproval: false,
  maxIdeasPerUser: null,
  enablePwaPrompt: false,
  allowSelfRegistration: true,
  domainRestrictionMode: 'none',
  allowedDomains: [],
  blockedDomains: [],
  demoDataLoaded: false,
  setupWizardCompleted: false,
  setupWizardStep: 0,
  toJSON() { return { ...this }; },
  ...overrides,
});

beforeEach(() => {
  orgFindOneMock.mockReset();
  orgUpdateMock.mockReset().mockResolvedValue([1]);
  storageAdapterSaveMock.mockReset().mockResolvedValue(undefined);
  storageAdapterDeleteMock.mockReset().mockResolvedValue(undefined);
  uploadFileBehaviour = null;
  authBehaviour = { mode: 'allow', isAdmin: true, isSuperuser: true, organizationId: 'settings-test-org' };
  validateText.mockResolvedValue({ isValid: true });
});

// ---------------------------------------------------------------------------
// GET /api/settings/organization/:organizationId/public (public route)
// ---------------------------------------------------------------------------

describe('GET /api/settings/organization/:organizationId/public', () => {
  it('returns public settings without authentication', async () => {
    orgFindOneMock.mockResolvedValueOnce(makeOrg({ logoUrl: '/uploads/logo.png' }));

    const res = await request(app)
      .get('/api/settings/organization/settings-test-org/public');

    expect(res.status).toBe(200);
    expect(res.body.organizationId).toBe('settings-test-org');
    expect(res.body.organizationName).toBe('Test Org');
    expect(res.body.logoUrl).toBe('/uploads/logo.png');
    // Must NOT expose private fields
    expect(res.body.allowedDomains).toBeUndefined();
    expect(res.body.blockedDomains).toBeUndefined();
  });

  it('returns 404 when organisation does not exist', async () => {
    orgFindOneMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/settings/organization/nonexistent/public');

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/settings/organization/:organizationId (protected)
// ---------------------------------------------------------------------------

describe('GET /api/settings/organization/:organizationId (protected)', () => {
  it('returns full settings for a matching-org user', async () => {
    orgFindOneMock.mockResolvedValueOnce(makeOrg());

    const res = await request(app)
      .get('/api/settings/organization/settings-test-org')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.organizationId).toBe('settings-test-org');
    expect(res.body.allowSelfRegistration).toBeDefined();
    expect(res.body.setupWizardCompleted).toBeDefined();
  });

  it('returns 401 without token', async () => {
    authBehaviour = { mode: 'reject' };
    const res = await request(app).get('/api/settings/organization/settings-test-org');
    expect(res.status).toBe(401);
  });

  it('returns 403 TENANT_MISMATCH when :organizationId differs from JWT org', async () => {
    const res = await request(app)
      .get('/api/settings/organization/other-org')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('returns 404 when organisation does not exist', async () => {
    orgFindOneMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/settings/organization/settings-test-org')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/settings/ (update settings, superuser only)
// ---------------------------------------------------------------------------

describe('POST /api/settings/', () => {
  it('updates organisation settings and returns success for a superuser', async () => {
    orgFindOneMock
      .mockResolvedValueOnce(makeOrg())   // before snapshot
      .mockResolvedValueOnce(makeOrg({ organizationName: 'Updated Org' })); // after snapshot

    const res = await request(app)
      .post('/api/settings/')
      .set('Authorization', 'Bearer fake')
      .send({ organizationName: 'Updated Org', primaryColor: '#ff0000' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(orgUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationName: 'Updated Org', primaryColor: '#ff0000' }),
      expect.objectContaining({ where: { organizationId: 'settings-test-org' } })
    );
  });

  it('returns 401 without token', async () => {
    authBehaviour = { mode: 'reject' };
    const res = await request(app).post('/api/settings/').send({ organizationName: 'X' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for an admin without superuser', async () => {
    authBehaviour = { mode: 'allow', isAdmin: true, isSuperuser: false, organizationId: 'settings-test-org' };

    const res = await request(app)
      .post('/api/settings/')
      .set('Authorization', 'Bearer fake')
      .send({ organizationName: 'X' });

    expect(res.status).toBe(403);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 403 TENANT_MISMATCH when organizationId in body differs from JWT org', async () => {
    const res = await request(app)
      .post('/api/settings/')
      .set('Authorization', 'Bearer fake')
      .send({ organizationId: 'other-org', organizationName: 'X' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when organizationName contains profanity', async () => {
    validateText.mockResolvedValueOnce({ isValid: false, error: 'Profanity detected' });

    const res = await request(app)
      .post('/api/settings/')
      .set('Authorization', 'Bearer fake')
      .send({ organizationName: 'badword org' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profanity/i);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/settings/setup-wizard (superuser only)
// ---------------------------------------------------------------------------

describe('PATCH /api/settings/setup-wizard', () => {
  it('updates wizard step for a superuser', async () => {
    const res = await request(app)
      .patch('/api/settings/setup-wizard')
      .set('Authorization', 'Bearer fake')
      .send({ step: 3 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(orgUpdateMock).toHaveBeenCalledWith(
      { setupWizardStep: 3 },
      expect.objectContaining({ where: { organizationId: 'settings-test-org' } })
    );
  });

  it('marks wizard complete when completed: true', async () => {
    const res = await request(app)
      .patch('/api/settings/setup-wizard')
      .set('Authorization', 'Bearer fake')
      .send({ completed: true });

    expect(res.status).toBe(200);
    expect(orgUpdateMock).toHaveBeenCalledWith(
      { setupWizardCompleted: true, setupWizardStep: 0 },
      expect.objectContaining({ where: { organizationId: 'settings-test-org' } })
    );
  });

  it('returns 400 when neither step nor completed is sent', async () => {
    const res = await request(app)
      .patch('/api/settings/setup-wizard')
      .set('Authorization', 'Bearer fake')
      .send({});

    expect(res.status).toBe(400);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 401 without token', async () => {
    authBehaviour = { mode: 'reject' };
    const res = await request(app).patch('/api/settings/setup-wizard').send({ step: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for an admin without superuser', async () => {
    authBehaviour = { mode: 'allow', isAdmin: true, isSuperuser: false, organizationId: 'settings-test-org' };

    const res = await request(app)
      .patch('/api/settings/setup-wizard')
      .set('Authorization', 'Bearer fake')
      .send({ step: 2 });

    expect(res.status).toBe(403);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/settings/upload-logo (superuser only)
// ---------------------------------------------------------------------------

describe('POST /api/settings/upload-logo', () => {
  it('saves logo and returns logoUrl for a superuser', async () => {
    uploadFileBehaviour = {
      filename: 'logo-abc123.png',
      buffer: Buffer.from('fake-image'),
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
    };
    orgFindOneMock
      .mockResolvedValueOnce(makeOrg())           // fetch org for old logo
      .mockResolvedValueOnce(makeOrg({ logoUrl: '/uploads/logo-abc123.png' })); // not used but safe

    const res = await request(app)
      .post('/api/settings/upload-logo')
      .set('Authorization', 'Bearer fake')
      .set('Content-Type', 'multipart/form-data');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logoUrl).toBe('/uploads/logo-abc123.png');
    expect(storageAdapterSaveMock).toHaveBeenCalledWith(
      'logo-abc123.png',
      expect.any(Buffer)
    );
    expect(orgUpdateMock).toHaveBeenCalledWith(
      { logoUrl: '/uploads/logo-abc123.png' },
      expect.objectContaining({ where: { organizationId: 'settings-test-org' } })
    );
  });

  it('deletes old logo when a new one is uploaded', async () => {
    uploadFileBehaviour = {
      filename: 'logo-new.png',
      buffer: Buffer.from('new-image'),
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 512,
    };
    orgFindOneMock.mockResolvedValueOnce(makeOrg({ logoUrl: '/uploads/logo-old.png' }));

    await request(app)
      .post('/api/settings/upload-logo')
      .set('Authorization', 'Bearer fake')
      .set('Content-Type', 'multipart/form-data');

    expect(storageAdapterDeleteMock).toHaveBeenCalledWith('logo-old.png');
  });

  it('returns 400 when no file is uploaded', async () => {
    uploadFileBehaviour = null;
    orgFindOneMock.mockResolvedValueOnce(makeOrg());

    const res = await request(app)
      .post('/api/settings/upload-logo')
      .set('Authorization', 'Bearer fake')
      .set('Content-Type', 'multipart/form-data');

    expect(res.status).toBe(400);
    expect(storageAdapterSaveMock).not.toHaveBeenCalled();
  });

  it('returns 401 without token', async () => {
    authBehaviour = { mode: 'reject' };
    const res = await request(app).post('/api/settings/upload-logo');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an admin without superuser', async () => {
    authBehaviour = { mode: 'allow', isAdmin: true, isSuperuser: false, organizationId: 'settings-test-org' };

    const res = await request(app)
      .post('/api/settings/upload-logo')
      .set('Authorization', 'Bearer fake')
      .set('Content-Type', 'multipart/form-data');

    expect(res.status).toBe(403);
    expect(storageAdapterSaveMock).not.toHaveBeenCalled();
  });

  it('returns 403 TENANT_MISMATCH when organizationId in body differs from JWT org', async () => {
    const res = await request(app)
      .post('/api/settings/upload-logo')
      .set('Authorization', 'Bearer fake')
      .send({ organizationId: 'other-org' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
    expect(storageAdapterSaveMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/settings/logo (superuser only)
// ---------------------------------------------------------------------------

describe('DELETE /api/settings/logo', () => {
  it('deletes logo file and clears logoUrl for a superuser', async () => {
    orgFindOneMock.mockResolvedValueOnce(makeOrg({ logoUrl: '/uploads/logo-old.png' }));

    const res = await request(app)
      .delete('/api/settings/logo')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(orgUpdateMock).toHaveBeenCalledWith(
      { logoUrl: null },
      expect.objectContaining({ where: { organizationId: 'settings-test-org' } })
    );
    expect(storageAdapterDeleteMock).toHaveBeenCalledWith('logo-old.png');
  });

  it('returns 404 when no logo is set', async () => {
    orgFindOneMock.mockResolvedValueOnce(makeOrg({ logoUrl: null }));

    const res = await request(app)
      .delete('/api/settings/logo')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(404);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when organisation does not exist', async () => {
    orgFindOneMock.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/settings/logo')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(404);
  });

  it('returns 401 without token', async () => {
    authBehaviour = { mode: 'reject' };
    const res = await request(app).delete('/api/settings/logo');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an admin without superuser', async () => {
    authBehaviour = { mode: 'allow', isAdmin: true, isSuperuser: false, organizationId: 'settings-test-org' };

    const res = await request(app)
      .delete('/api/settings/logo')
      .set('Authorization', 'Bearer fake');

    expect(res.status).toBe(403);
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 403 TENANT_MISMATCH when organizationId in body differs from JWT org', async () => {
    const res = await request(app)
      .delete('/api/settings/logo')
      .set('Authorization', 'Bearer fake')
      .send({ organizationId: 'other-org' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
    expect(orgUpdateMock).not.toHaveBeenCalled();
  });
});
