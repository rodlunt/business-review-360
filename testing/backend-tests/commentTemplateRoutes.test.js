/**
 * Issue #525 -- comment template CRUD routes.
 *
 * Covers: auth guard (401), admin guard on mutating routes (403),
 * list (200), create (201), update (200), delete (200), not-found (404).
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// --- mocks -------------------------------------------------------------------

let authBehaviour = { mode: 'allow', isAdmin: true, organizationId: 'org-a', tenant_id: 'tenant-1' };

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (authBehaviour.mode === 'reject') {
      return res.status(401).json({ error: 'No token provided' });
    }
    req.user = {
      id: 'user-1',
      isAdmin: authBehaviour.isAdmin,
      organizationId: authBehaviour.organizationId,
      tenant_id: authBehaviour.tenant_id,
    };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
    next();
  },
}));

const templateFindAllMock = jest.fn();
const templateFindOneMock = jest.fn();
const templateCreateMock = jest.fn();
const templateUpdateMock = jest.fn();
const templateDestroyMock = jest.fn();

jest.unstable_mockModule('../../backend/src/models/CommentTemplate.js', () => ({
  default: {
    findAll: templateFindAllMock,
    findOne: templateFindOneMock,
    create: templateCreateMock,
  },
}));

jest.unstable_mockModule('../../backend/src/utils/formatServerError.js', () => ({
  formatServerError: (err, msg) => ({ error: msg, details: err.message }),
}));

jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

// --- import after mocks -------------------------------------------------------

const { default: commentTemplateRoutes } = await import('../../backend/src/routes/commentTemplates.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/comment-templates', authenticate, commentTemplateRoutes);
});

beforeEach(() => {
  templateFindAllMock.mockReset();
  templateFindOneMock.mockReset();
  templateCreateMock.mockReset();
  authBehaviour = { mode: 'allow', isAdmin: true, organizationId: 'org-a', tenant_id: 'tenant-1' };
});

// --- tests -------------------------------------------------------------------

describe('Issue #525 -- comment template routes', () => {
  describe('GET /api/comment-templates', () => {
    it('case 1: unauthenticated returns 401', async () => {
      authBehaviour = { mode: 'reject' };
      const res = await request(app).get('/api/comment-templates');
      expect(res.status).toBe(401);
      expect(templateFindAllMock).not.toHaveBeenCalled();
    });

    it('case 2: authenticated returns template list', async () => {
      const mockTemplates = [
        { id: 't1', title: 'Approved', content: 'Great idea, approved!' },
        { id: 't2', title: 'Reviewing', content: "Thanks, we'll review this." },
      ];
      templateFindAllMock.mockResolvedValueOnce(mockTemplates);

      const res = await request(app)
        .get('/api/comment-templates')
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Approved');
    });

    it('case 3: non-admin can also list templates', async () => {
      authBehaviour = { mode: 'allow', isAdmin: false, organizationId: 'org-a', tenant_id: 'tenant-1' };
      templateFindAllMock.mockResolvedValueOnce([]);
      const res = await request(app)
        .get('/api/comment-templates')
        .set('Authorization', 'Bearer fake');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/comment-templates', () => {
    it('case 4: non-admin returns 403', async () => {
      authBehaviour = { mode: 'allow', isAdmin: false, organizationId: 'org-a', tenant_id: 'tenant-1' };
      const res = await request(app)
        .post('/api/comment-templates')
        .set('Authorization', 'Bearer fake')
        .send({ title: 'Test', content: 'Content' });
      expect(res.status).toBe(403);
      expect(templateCreateMock).not.toHaveBeenCalled();
    });

    it('case 5: missing fields returns 400', async () => {
      const res = await request(app)
        .post('/api/comment-templates')
        .set('Authorization', 'Bearer fake')
        .send({ title: 'Test' });
      expect(res.status).toBe(400);
      expect(templateCreateMock).not.toHaveBeenCalled();
    });

    it('case 6: admin creates template and returns 201', async () => {
      const created = { id: 't-new', title: 'Approved', content: 'Great idea!' };
      templateCreateMock.mockResolvedValueOnce(created);

      const res = await request(app)
        .post('/api/comment-templates')
        .set('Authorization', 'Bearer fake')
        .send({ title: 'Approved', content: 'Great idea!' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Approved');
      expect(templateCreateMock).toHaveBeenCalledWith({
        title: 'Approved',
        content: 'Great idea!',
        organizationId: 'org-a',
        tenant_id: 'tenant-1',
      });
    });
  });

  describe('PUT /api/comment-templates/:id', () => {
    it('case 7: non-admin returns 403', async () => {
      authBehaviour = { mode: 'allow', isAdmin: false, organizationId: 'org-a', tenant_id: 'tenant-1' };
      const res = await request(app)
        .put('/api/comment-templates/t1')
        .set('Authorization', 'Bearer fake')
        .send({ title: 'Updated', content: 'Content' });
      expect(res.status).toBe(403);
    });

    it('case 8: template not found returns 404', async () => {
      templateFindOneMock.mockResolvedValueOnce(null);
      const res = await request(app)
        .put('/api/comment-templates/missing-id')
        .set('Authorization', 'Bearer fake')
        .send({ title: 'Updated', content: 'New content' });
      expect(res.status).toBe(404);
    });

    it('case 9: admin updates and returns 200', async () => {
      const instance = { id: 't1', title: 'Old', content: 'Old content', update: templateUpdateMock };
      templateUpdateMock.mockResolvedValueOnce(instance);
      templateFindOneMock.mockResolvedValueOnce(instance);

      const res = await request(app)
        .put('/api/comment-templates/t1')
        .set('Authorization', 'Bearer fake')
        .send({ title: 'Updated', content: 'New content' });

      expect(res.status).toBe(200);
      expect(templateUpdateMock).toHaveBeenCalledWith({ title: 'Updated', content: 'New content' });
    });
  });

  describe('DELETE /api/comment-templates/:id', () => {
    it('case 10: non-admin returns 403', async () => {
      authBehaviour = { mode: 'allow', isAdmin: false, organizationId: 'org-a', tenant_id: 'tenant-1' };
      const res = await request(app)
        .delete('/api/comment-templates/t1')
        .set('Authorization', 'Bearer fake');
      expect(res.status).toBe(403);
    });

    it('case 11: not found returns 404', async () => {
      templateFindOneMock.mockResolvedValueOnce(null);
      const res = await request(app)
        .delete('/api/comment-templates/missing')
        .set('Authorization', 'Bearer fake');
      expect(res.status).toBe(404);
    });

    it('case 12: admin deletes and returns 200', async () => {
      const instance = { id: 't1', destroy: templateDestroyMock };
      templateDestroyMock.mockResolvedValueOnce(undefined);
      templateFindOneMock.mockResolvedValueOnce(instance);

      const res = await request(app)
        .delete('/api/comment-templates/t1')
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(templateDestroyMock).toHaveBeenCalled();
    });
  });
});

describe('commentTemplates -- cross-tenant data isolation', () => {
  it('GET scopes findAll to the authenticated user\'s organisation', async () => {
    authBehaviour = { mode: 'allow', isAdmin: false, organizationId: 'org-b', tenant_id: 'tenant-2' };
    templateFindAllMock.mockResolvedValueOnce([]);

    await request(app)
      .get('/api/comment-templates')
      .set('Authorization', 'Bearer fake');

    expect(templateFindAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-b' }),
      })
    );
  });

  it('PUT scopes findOne to the authenticated user\'s organisation', async () => {
    authBehaviour = { mode: 'allow', isAdmin: true, organizationId: 'org-b', tenant_id: 'tenant-2' };
    templateFindOneMock.mockResolvedValueOnce(null);

    await request(app)
      .put('/api/comment-templates/some-id')
      .set('Authorization', 'Bearer fake')
      .send({ title: 'Updated', content: 'New content' });

    expect(templateFindOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-b' }),
      })
    );
  });

  it('DELETE scopes findOne to the authenticated user\'s organisation', async () => {
    authBehaviour = { mode: 'allow', isAdmin: true, organizationId: 'org-b', tenant_id: 'tenant-2' };
    templateFindOneMock.mockResolvedValueOnce(null);

    await request(app)
      .delete('/api/comment-templates/some-id')
      .set('Authorization', 'Bearer fake');

    expect(templateFindOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-b' }),
      })
    );
  });
});
