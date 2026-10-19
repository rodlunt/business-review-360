/**
 * Issue #693 -- /api/analytics returns 403 TENANT_MISMATCH on cross-tenant probe.
 *
 * Before this fix, GET /api/analytics?organizationId=X with a JWT for tenant Y
 * returned 200 with tenant-Y data (no leak, but a confusing API contract). The
 * fix wires the existing requireSameOrganization gate into the analytics route
 * chain, matching the standard pattern already used by ideas, comments, votes,
 * notifications, settings, and billing. The middleware also now emits a
 * machine-readable `code: "TENANT_MISMATCH"` field on the 403, per the issue
 * spec.
 *
 * The scheduled cross-tenant smoke routine (trig_01DVuCLZcY6rUwgpQS1vonJn)
 * already exercises this against prod, but the issue's acceptance criteria
 * require an in-process unit test so the contract is enforced on every PR run.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-prod-please';

const orgAHandle = 'org-alpha-693';
const orgBHandle = 'org-bravo-693';

const userAId = 9301;
const userATokenAdmin = jwt.sign(
  { id: userAId, username: 'orgAadmin', isAdmin: true, organizationId: orgAHandle },
  JWT_SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

const testUsers = {};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const { default: analyticsRoutes } = await import('../../backend/src/routes/analytics.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/analytics', authenticate, analyticsRoutes);
});

beforeEach(() => {
  testUsers[userAId] = {
    id: userAId,
    username: 'orgAadmin',
    email: 'orgAadmin@test.invalid',
    isAdmin: true,
    isAnonymous: false,
    organizationId: orgAHandle,
  };
});

describe('Issue #693 -- GET /api/analytics cross-tenant request returns 403 TENANT_MISMATCH', () => {
  it('returns 403 with code TENANT_MISMATCH when ?organizationId disagrees with JWT', async () => {
    const res = await request(app)
      .get('/api/analytics')
      .query({ organizationId: orgBHandle })
      .set('Authorization', `Bearer ${userATokenAdmin}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
    expect(res.body.error).toMatch(/access to this organization/i);
  });

  it('returns 403 with code TENANT_MISMATCH on /priority-matrix cross-tenant probe', async () => {
    const res = await request(app)
      .get('/api/analytics/priority-matrix')
      .query({ organizationId: orgBHandle })
      .set('Authorization', `Bearer ${userATokenAdmin}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });
});
