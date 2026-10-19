/**
 * Issue #475 regression guard.
 *
 * POST /api/setup/create-superuser previously stringified req.body and
 * req.headers into console.error on every call, leaking the plaintext
 * password and any Authorization/Cookie headers into container logs.
 *
 * This test drives the endpoint with a known password and asserts that no
 * stdout/stderr log line emitted during the request contains that password
 * or the raw auth header value.
 */
import { jest } from '@jest/globals';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Sequelize, DataTypes } from 'sequelize';

// Re-declare a minimal User model against an in-memory sqlite so setup.js
// picks it up. setup.js imports the real User.js, which imports
// backend/src/models/database.js (postgres). Bind the exported sequelize
// instance to sqlite before loading the route.

import User from '../../backend/src/models/User.js';
import Idea from '../../backend/src/models/Idea.js';
import Comment from '../../backend/src/models/Comment.js';
import Vote from '../../backend/src/models/Vote.js';

const { default: setupRoutes } = await import('../../backend/src/routes/setup.js');

let sequelize;
let app;

const knownPassword = 'CorrectHorseBatteryStaple!99';
const knownAuthHeader = 'Bearer super-secret-token-xyz-do-not-log';

beforeAll(async () => {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });

  // Override model bindings onto the sqlite instance.
  const userAttrs = {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    passwordHash: { type: DataTypes.STRING },
    isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    isAnonymous: { type: DataTypes.BOOLEAN, defaultValue: false },
    organizationId: { type: DataTypes.STRING },
    tenant_id: { type: DataTypes.STRING },
  };
  User.init(userAttrs, { sequelize, modelName: 'User', tableName: 'Users' });
  Idea.init({ id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } }, { sequelize, modelName: 'Idea', tableName: 'Ideas' });
  Comment.init({ id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } }, { sequelize, modelName: 'Comment', tableName: 'Comments' });
  Vote.init({ id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } }, { sequelize, modelName: 'Vote', tableName: 'Votes' });

  await sequelize.sync();

  app = express();
  app.use(express.json());

  // Stub tenant resolver middleware (the real one hits Postgres).
  app.use((req, _res, next) => {
    req.tenant = {
      id: 'tenant-test-uuid',
      tenant_name: 'Test Tenant',
    };
    next();
  });

  app.use('/api/setup', setupRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

let logSpy;
let errSpy;
let warnSpy;

beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  warnSpy.mockRestore();
});

function collectLogCalls() {
  const all = [];
  for (const spy of [logSpy, errSpy, warnSpy]) {
    for (const call of spy.mock.calls) {
      all.push(call.map((arg) => {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(' '));
    }
  }
  return all.join('\n');
}

describe('Issue #475 - POST /api/setup/create-superuser must not log credentials', () => {
  it('does not log the plaintext password anywhere in stdout/stderr', async () => {
    await request(app)
      .post('/api/setup/create-superuser')
      .set('Authorization', knownAuthHeader)
      .send({
        username: 'founder',
        password: knownPassword,
        email: 'founder@example.com',
        organizationId: 'test-org',
      });

    const output = collectLogCalls();
    expect(output).not.toContain(knownPassword);
  });

  it('does not log raw Authorization header values', async () => {
    await request(app)
      .post('/api/setup/create-superuser')
      .set('Authorization', knownAuthHeader)
      .send({
        username: 'founder2',
        password: knownPassword,
        email: 'founder2@example.com',
        organizationId: 'test-org',
      });

    const output = collectLogCalls();
    expect(output).not.toContain(knownAuthHeader);
    expect(output).not.toContain('super-secret-token-xyz-do-not-log');
  });

  it('does not log the plaintext password when validation fails (missing organizationId)', async () => {
    await request(app)
      .post('/api/setup/create-superuser')
      .send({
        username: 'founder3',
        password: knownPassword,
        email: 'founder3@example.com',
        // organizationId intentionally omitted to hit the early-return path
      });

    const output = collectLogCalls();
    expect(output).not.toContain(knownPassword);
  });
});
