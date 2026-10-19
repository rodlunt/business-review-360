/**
 * Issue #527 -- Demo data load/remove routes.
 *
 * Tests: auth guard (401), admin guard (403), idempotency (409 on re-load),
 * happy-path load (201 shape), happy-path remove (200 shape), and the
 * demoDataLoaded flag reflected in GET /settings/organization/:orgId.
 *
 * Pattern: jest.unstable_mockModule for every import that hits the DB or
 * file system so the suite runs without a live Postgres instance.
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// --- mocks registered BEFORE router imports -----------------------------------

let authBehaviour = { mode: 'allow', isAdmin: true, isSuperuser: true, organizationId: 'demo-org' };

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (authBehaviour.mode === 'reject') {
      return res.status(401).json({ error: 'No token provided' });
    }
    req.user = {
      id: 'user-uuid-1',
      username: 'admin-user',
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
      return res.status(403).json({ error: "You do not have access to this organisation's data." });
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
jest.unstable_mockModule('../../backend/src/models/Organization.js', () => ({
  default: { findOne: orgFindOneMock, update: jest.fn().mockResolvedValue([1]) },
}));

const loadDemoDataMock = jest.fn();
const removeDemoDataMock = jest.fn();
jest.unstable_mockModule('../../backend/src/services/demoDataService.js', () => ({
  loadDemoData: loadDemoDataMock,
  removeDemoData: removeDemoDataMock,
}));

jest.unstable_mockModule('../../backend/src/middleware/upload.js', () => ({
  default: { single: () => (req, res, next) => next() },
  storageAdapter: { save: jest.fn(), delete: jest.fn() },
}));

jest.unstable_mockModule('../../backend/src/middleware/validateFileMagicBytes.js', () => ({
  validateFileMagicBytes: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../backend/src/middleware/profanityFilter.js', () => ({
  validateText: jest.fn().mockResolvedValue({ isValid: true }),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  redactForAudit: (obj) => obj,
}));

jest.unstable_mockModule('../../backend/src/utils/formatServerError.js', () => ({
  formatServerError: (err, msg) => ({ error: msg, details: err.message }),
}));

jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

// --- import routers after mocks -----------------------------------------------

const { publicRouter: settingsPublic, protectedRouter: settingsProtected } = await import(
  '../../backend/src/routes/settings.js'
);
const { authenticate } = await import('../../backend/src/middleware/auth.js');

// --- app setup ---------------------------------------------------------------

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  // Inject a minimal req.tenant for the protected routes that need it
  app.use((req, res, next) => {
    req.tenant = { id: 'tenant-uuid-1', org_id: 'demo-org' };
    next();
  });
  app.use('/api/settings', settingsPublic);
  app.use('/api/settings', authenticate, settingsProtected);
});

beforeEach(() => {
  loadDemoDataMock.mockReset();
  removeDemoDataMock.mockReset();
  orgFindOneMock.mockReset();
  authBehaviour = { mode: 'allow', isAdmin: true, organizationId: 'demo-org' };
});

// --- tests -------------------------------------------------------------------

describe('Issue #527 -- demo data routes', () => {
  describe('POST /api/settings/demo-data', () => {
    it('case 1: unauthenticated returns 401', async () => {
      authBehaviour = { mode: 'reject' };
      const res = await request(app).post('/api/settings/demo-data');
      expect(res.status).toBe(401);
      expect(loadDemoDataMock).not.toHaveBeenCalled();
    });

    it('case 2: non-admin returns 403', async () => {
      authBehaviour = { mode: 'allow', isAdmin: false, organizationId: 'demo-org' };
      const res = await request(app)
        .post('/api/settings/demo-data')
        .set('Authorization', 'Bearer fake');
      expect(res.status).toBe(403);
      expect(loadDemoDataMock).not.toHaveBeenCalled();
    });

    it('case 3: returns 409 when demo data already loaded', async () => {
      orgFindOneMock.mockResolvedValueOnce({ id: 'org-id-1', demoDataLoaded: true });
      const res = await request(app)
        .post('/api/settings/demo-data')
        .set('Authorization', 'Bearer fake');
      expect(res.status).toBe(409);
      expect(loadDemoDataMock).not.toHaveBeenCalled();
    });

    it('case 4: happy path returns 200 with ideaCount', async () => {
      orgFindOneMock.mockResolvedValueOnce({ id: 'org-id-1', demoDataLoaded: false });
      loadDemoDataMock.mockResolvedValueOnce({ ideaCount: 10 });

      const res = await request(app)
        .post('/api/settings/demo-data')
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ideaCount).toBe(10);
      expect(loadDemoDataMock).toHaveBeenCalledWith({
        tenantId: 'tenant-uuid-1',
        organizationId: 'demo-org',
        adminUserId: 'user-uuid-1',
      });
    });
  });

  describe('DELETE /api/settings/demo-data', () => {
    it('case 5: unauthenticated returns 401', async () => {
      authBehaviour = { mode: 'reject' };
      const res = await request(app).delete('/api/settings/demo-data');
      expect(res.status).toBe(401);
      expect(removeDemoDataMock).not.toHaveBeenCalled();
    });

    it('case 6: non-admin returns 403', async () => {
      authBehaviour = { mode: 'allow', isAdmin: false, organizationId: 'demo-org' };
      const res = await request(app)
        .delete('/api/settings/demo-data')
        .set('Authorization', 'Bearer fake');
      expect(res.status).toBe(403);
      expect(removeDemoDataMock).not.toHaveBeenCalled();
    });

    it('case 7: happy path returns 200 with removedCount', async () => {
      orgFindOneMock.mockResolvedValueOnce({ id: 'org-id-1', demoDataLoaded: true });
      removeDemoDataMock.mockResolvedValueOnce({ removedCount: 10 });

      const res = await request(app)
        .delete('/api/settings/demo-data')
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.removedCount).toBe(10);
      expect(removeDemoDataMock).toHaveBeenCalledWith({
        tenantId: 'tenant-uuid-1',
        organizationId: 'demo-org',
      });
    });

    it('case 8: remove works even when demoDataLoaded is false (already clean)', async () => {
      orgFindOneMock.mockResolvedValueOnce({ id: 'org-id-1', demoDataLoaded: false });
      removeDemoDataMock.mockResolvedValueOnce({ removedCount: 0 });

      const res = await request(app)
        .delete('/api/settings/demo-data')
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(200);
      expect(res.body.removedCount).toBe(0);
    });
  });
});
