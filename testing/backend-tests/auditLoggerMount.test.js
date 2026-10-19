/**
 * Issue #586 regression guard.
 *
 * The auditLogger middleware factory is mounted on /api/auth (and other
 * routers) in backend/src/index.js. This test asserts that when the
 * middleware is in the request pipeline, AuditLog.create is invoked
 * with the expected metadata shape after a request completes, and that
 * ENABLE_AUDIT_LOGGING=false suppresses the write.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));

// Phase 5a (#858): a failed login with no organizationId is now the
// org-less path (credential = email). Mock User so an unknown email
// resolves to zero rows -> a genuine 401 failed login, keeping this
// test's intent ("auditLogger fires for a failed LOGIN") rather than
// degrading it to a 400 validation reject. AuditLog stays REAL (the
// test spies on AuditLog.create).
const mockUser = { findAll: jest.fn().mockResolvedValue([]), findByPk: jest.fn() };
jest.unstable_mockModule('../../backend/src/models/User.js', () => ({ default: mockUser }));

import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// #720: auth.js now exports publicRouter + protectedRouter. Mount both
// to mirror production wiring (authenticate sits between them).
const { publicRouter: authPublic, protectedRouter: authProtected } = await import('../../backend/src/routes/auth.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');
const { AuditLog } = await import('../../backend/src/middleware/auditLog.js');

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/auth', authPublic);
  app.use('/api/auth', authenticate, authProtected);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Issue #586 - auditLogger fires for mounted routers', () => {
  it('schedules an AuditLog.create entry for a failed login (no organizationId)', async () => {
    const createSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue();

    // Issue #593: backend/.env.test sets ENABLE_AUDIT_LOGGING=false so audit
    // writes are dormant by default during tests. This test specifically
    // exercises the firing path, so override locally and restore in finally.
    const prev = process.env.ENABLE_AUDIT_LOGGING;
    process.env.ENABLE_AUDIT_LOGGING = 'true';

    try {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'whatever' });

      // The middleware fires AuditLog.create from inside a wrapped res.json
      // without awaiting it. Flush microtasks so the spy assertion is stable.
      await new Promise((resolve) => setImmediate(resolve));

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.login',
          actor_email: 'anonymous',
          status: 'failure',
          metadata: expect.objectContaining({
            method: 'POST',
            path: '/login',
            statusCode: 401,
          }),
        })
      );
    } finally {
      if (prev === undefined) {
        delete process.env.ENABLE_AUDIT_LOGGING;
      } else {
        process.env.ENABLE_AUDIT_LOGGING = prev;
      }
    }
  });

  it('does NOT call AuditLog.create when ENABLE_AUDIT_LOGGING=false', async () => {
    const createSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue();
    const prev = process.env.ENABLE_AUDIT_LOGGING;
    process.env.ENABLE_AUDIT_LOGGING = 'false';

    try {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'whatever' });
      await new Promise((resolve) => setImmediate(resolve));
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) {
        delete process.env.ENABLE_AUDIT_LOGGING;
      } else {
        process.env.ENABLE_AUDIT_LOGGING = prev;
      }
    }
  });
});
