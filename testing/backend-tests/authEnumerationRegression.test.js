/**
 * Issue #540 regression guard.
 *
 * POST /api/auth/request-password-reset and POST /api/auth/recover must return
 * identical HTTP status and body for registered, unregistered, and anonymous
 * users. Any divergence is user enumeration (OWASP ASVS 2.2.3 / 7.1.1).
 */
import { jest } from '@jest/globals';

// Mock the notification email service before dynamically importing auth.js so
// password-reset emails never hit the real email provider (Resend) in tests.
jest.unstable_mockModule('../../backend/src/services/notificationEmailService.js', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
  sendAdminUserPendingApprovalEmail: jest.fn().mockResolvedValue(true),
  sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
}));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Sequelize } from 'sequelize';

import User from '../../backend/src/models/User.js';

// auth.js must be imported AFTER the mailer mock so its static imports bind to
// the mock, not the real Resend transport.
// #720: auth.js now exports publicRouter + protectedRouter.
const { publicRouter: authPublic, protectedRouter: authProtected } = await import('../../backend/src/routes/auth.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let sequelize;
let app;

const orgId = '11111111-1111-1111-1111-111111111111';

beforeAll(async () => {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });

  User.init(
    {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING },
      email: { type: Sequelize.STRING },
      passwordHash: { type: Sequelize.STRING },
      isAdmin: { type: Sequelize.BOOLEAN, defaultValue: false },
      isAnonymous: { type: Sequelize.BOOLEAN, defaultValue: false },
      organizationId: { type: Sequelize.UUID },
      passwordResetToken: { type: Sequelize.STRING },
      passwordResetExpires: { type: Sequelize.DATE },
    },
    { sequelize, modelName: 'User', tableName: 'Users' }
  );

  await sequelize.sync();

  app = express();
  app.use(express.json());
  app.use('/api/auth', authPublic);
  app.use('/api/auth', authenticate, authProtected);
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await User.destroy({ where: {} });
  await User.create({
    username: 'alice',
    email: 'alice@example.com',
    passwordHash: 'ignored',
    isAnonymous: false,
    organizationId: orgId,
  });
  await User.create({
    username: 'bob-anon',
    email: 'bob@example.com',
    passwordHash: 'ignored',
    isAnonymous: true,
    organizationId: orgId,
  });
});

describe('Issue #540 - password-reset endpoints must not leak account existence', () => {
  describe.each([
    '/api/auth/request-password-reset',
    '/api/auth/recover',
  ])('POST %s', (path) => {
    it('returns identical status and body for registered vs unregistered email', async () => {
      const registered = await request(app)
        .post(path)
        .send({ email: 'alice@example.com' });

      const unregistered = await request(app)
        .post(path)
        .send({ email: 'nobody@example.com' });

      expect(registered.status).toBe(200);
      expect(unregistered.status).toBe(registered.status);
      expect(unregistered.body).toEqual(registered.body);
    });

    it('returns identical status and body for registered vs anonymous account', async () => {
      const registered = await request(app)
        .post(path)
        .send({ email: 'alice@example.com' });

      const anonymous = await request(app)
        .post(path)
        .send({ email: 'bob@example.com' });

      expect(registered.status).toBe(200);
      expect(anonymous.status).toBe(registered.status);
      expect(anonymous.body).toEqual(registered.body);
    });
  });
});
