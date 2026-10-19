/**
 * Issue #524 -- saved filter CRUD routes.
 *
 * Covers: auth guard (401), list (200), create (201 + validation),
 * delete own (200), delete not-found (404), filter key sanitisation.
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// --- mocks -------------------------------------------------------------------

let authBehaviour = { mode: 'allow', userId: 'user-1', organizationId: 'org-a', tenant_id: 'tenant-1' };

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (authBehaviour.mode === 'reject') {
      return res.status(401).json({ error: 'No token provided' });
    }
    req.user = {
      id: authBehaviour.userId,
      organizationId: authBehaviour.organizationId,
      tenant_id: authBehaviour.tenant_id,
    };
    next();
  },
}));

const sfFindAllMock = jest.fn();
const sfFindOneMock = jest.fn();
const sfCreateMock = jest.fn();
const sfDestroyMock = jest.fn();

jest.unstable_mockModule('../../backend/src/models/SavedFilter.js', () => ({
  default: {
    findAll: sfFindAllMock,
    findOne: sfFindOneMock,
    create: sfCreateMock,
  },
}));

jest.unstable_mockModule('../../backend/src/utils/formatServerError.js', () => ({
  formatServerError: (err, msg) => ({ error: msg }),
}));

jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));

// --- import after mocks -------------------------------------------------------

const { default: savedFilterRoutes } = await import('../../backend/src/routes/savedFilters.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/saved-filters', authenticate, savedFilterRoutes);
});

beforeEach(() => {
  sfFindAllMock.mockReset();
  sfFindOneMock.mockReset();
  sfCreateMock.mockReset();
  sfDestroyMock.mockReset();
  authBehaviour = { mode: 'allow', userId: 'user-1', organizationId: 'org-a', tenant_id: 'tenant-1' };
});

// --- tests -------------------------------------------------------------------

describe('Issue #524 -- saved filter routes', () => {
  describe('GET /api/saved-filters', () => {
    it('case 1: unauthenticated returns 401', async () => {
      authBehaviour = { mode: 'reject' };
      const res = await request(app).get('/api/saved-filters');
      expect(res.status).toBe(401);
      expect(sfFindAllMock).not.toHaveBeenCalled();
    });

    it('case 2: returns list of user saved filters', async () => {
      const records = [
        { id: 'sf1', name: 'My Filter', filters: { status: 'Reviewing' } },
      ];
      sfFindAllMock.mockResolvedValueOnce(records);

      const res = await request(app)
        .get('/api/saved-filters')
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('My Filter');
      // Must scope to current user
      expect(sfFindAllMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) })
      );
    });
  });

  describe('POST /api/saved-filters', () => {
    it('case 3: missing name returns 400', async () => {
      const res = await request(app)
        .post('/api/saved-filters')
        .set('Authorization', 'Bearer fake')
        .send({ filters: { status: 'Reviewing' } });
      expect(res.status).toBe(400);
      expect(sfCreateMock).not.toHaveBeenCalled();
    });

    it('case 4: empty filters object returns 400', async () => {
      const res = await request(app)
        .post('/api/saved-filters')
        .set('Authorization', 'Bearer fake')
        .send({ name: 'Test', filters: {} });
      expect(res.status).toBe(400);
    });

    it('case 5: unknown filter keys are stripped; valid keys accepted', async () => {
      const created = { id: 'sf-new', name: 'My Filter', filters: { status: 'Reviewing' } };
      sfCreateMock.mockResolvedValueOnce(created);

      const res = await request(app)
        .post('/api/saved-filters')
        .set('Authorization', 'Bearer fake')
        .send({ name: 'My Filter', filters: { status: 'Reviewing', __proto__: 'evil', injected: 'bad' } });

      expect(res.status).toBe(201);
      const calledWith = sfCreateMock.mock.calls[0][0];
      expect(calledWith.filters).toEqual({ status: 'Reviewing' });
      expect(Object.hasOwn(calledWith.filters, '__proto__')).toBe(false);
    });

    it('case 6: happy path returns 201 with the saved record', async () => {
      const created = { id: 'sf-new', name: 'High Vote', filters: { sort: 'popular' } };
      sfCreateMock.mockResolvedValueOnce(created);

      const res = await request(app)
        .post('/api/saved-filters')
        .set('Authorization', 'Bearer fake')
        .send({ name: 'High Vote', filters: { sort: 'popular' } });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('High Vote');
      expect(sfCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', organizationId: 'org-a' })
      );
    });
  });

  describe('DELETE /api/saved-filters/:id', () => {
    it('case 7: not found returns 404', async () => {
      sfFindOneMock.mockResolvedValueOnce(null);
      const res = await request(app)
        .delete('/api/saved-filters/missing-id')
        .set('Authorization', 'Bearer fake');
      expect(res.status).toBe(404);
    });

    it('case 8: happy path deletes and returns 200', async () => {
      const instance = { id: 'sf1', destroy: sfDestroyMock };
      sfFindOneMock.mockResolvedValueOnce(instance);
      sfDestroyMock.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .delete('/api/saved-filters/sf1')
        .set('Authorization', 'Bearer fake');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sfDestroyMock).toHaveBeenCalled();
      // Must scope to current user to prevent cross-user deletion
      expect(sfFindOneMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) })
      );
    });
  });
});

describe('savedFilters -- cross-tenant data isolation', () => {
  it('GET scopes findAll to the authenticated user\'s organisation', async () => {
    authBehaviour = { mode: 'allow', userId: 'user-2', organizationId: 'org-b', tenant_id: 'tenant-2' };
    sfFindAllMock.mockResolvedValueOnce([]);

    await request(app).get('/api/saved-filters').set('Authorization', 'Bearer fake');

    expect(sfFindAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-b', userId: 'user-2' }),
      })
    );
  });

  it('DELETE scopes findOne to the authenticated user\'s organisation', async () => {
    authBehaviour = { mode: 'allow', userId: 'user-2', organizationId: 'org-b', tenant_id: 'tenant-2' };
    sfFindOneMock.mockResolvedValueOnce(null);

    await request(app).delete('/api/saved-filters/sf1').set('Authorization', 'Bearer fake');

    expect(sfFindOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-b', userId: 'user-2' }),
      })
    );
  });

  it('POST scopes create to the authenticated user\'s organisation', async () => {
    authBehaviour = { mode: 'allow', userId: 'user-2', organizationId: 'org-b', tenant_id: 'tenant-2' };
    sfCreateMock.mockResolvedValueOnce({ id: 'sf-new', name: 'Filter', filters: { status: 'Reviewing' } });

    await request(app)
      .post('/api/saved-filters')
      .set('Authorization', 'Bearer fake')
      .send({ name: 'Filter', filters: { status: 'Reviewing' } });

    expect(sfCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-b', userId: 'user-2' })
    );
  });
});
