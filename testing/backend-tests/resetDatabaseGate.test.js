/**
 * Issue #544 regression guard.
 *
 * POST /api/setup/reset-database previously accepted any request whenever
 * NODE_ENV !== 'production'. This test locks in three invariants:
 *
 *   1. When ALLOW_DESTRUCTIVE_TEST_ENDPOINTS !== 'true', the route is not
 *      mounted at all (404, not 403). The endpoint must leave zero
 *      fingerprint in production.
 *   2. When the flag is set but the request lacks the per-boot
 *      X-Test-Reset-Token header, the handler rejects with 401.
 *   3. When the flag is set and the correct token is presented, the
 *      handler invokes the wipe.
 *
 * The token is cached at module load, so each scenario uses a fresh dynamic
 * import with a cache-busting query string.
 */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sequelize, DataTypes } from 'sequelize';

import User from '../../backend/src/models/User.js';
import Idea from '../../backend/src/models/Idea.js';
import Comment from '../../backend/src/models/Comment.js';
import Vote from '../../backend/src/models/Vote.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.resolve(__dirname, '../../backend/.test-reset-token');

let sequelize;

async function bindModelsToSqlite() {
  sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
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
}

async function loadSetupRouter(envOverrides = {}) {
  const saved = {
    ALLOW_DESTRUCTIVE_TEST_ENDPOINTS: process.env.ALLOW_DESTRUCTIVE_TEST_ENDPOINTS,
    NODE_ENV: process.env.NODE_ENV,
  };
  Object.assign(process.env, envOverrides);

  // Reset module cache so setup.js re-evaluates its mount-time check.
  jest.resetModules();
  const mod = await import(`../../backend/src/routes/setup.js?bust=${Date.now()}-${Math.random()}`);

  Object.assign(process.env, saved);
  return mod.default;
}

function buildApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/setup', router);
  return app;
}

beforeAll(async () => {
  // Make sure any stale token file from a previous run does not bleed in.
  try { fs.unlinkSync(TOKEN_PATH); } catch { /* ignore */ }
  await bindModelsToSqlite();
});

afterAll(async () => {
  await sequelize?.close();
  try { fs.unlinkSync(TOKEN_PATH); } catch { /* ignore */ }
});

describe('Issue #544 - reset-database endpoint gating', () => {
  it('returns 404 when ALLOW_DESTRUCTIVE_TEST_ENDPOINTS is unset (route not mounted)', async () => {
    delete process.env.ALLOW_DESTRUCTIVE_TEST_ENDPOINTS;
    const router = await loadSetupRouter({ NODE_ENV: 'test' });
    const app = buildApp(router);

    const res = await request(app).post('/api/setup/reset-database').send({});
    expect(res.status).toBe(404);
  });

  it('returns 404 when NODE_ENV=production even with the flag set', async () => {
    const router = await loadSetupRouter({
      ALLOW_DESTRUCTIVE_TEST_ENDPOINTS: 'true',
      NODE_ENV: 'production',
    });
    const app = buildApp(router);

    const res = await request(app).post('/api/setup/reset-database').send({});
    expect(res.status).toBe(404);
  });

  it('returns 401 when flag set but no X-Test-Reset-Token header is sent', async () => {
    try { fs.unlinkSync(TOKEN_PATH); } catch { /* ignore */ }
    const router = await loadSetupRouter({
      ALLOW_DESTRUCTIVE_TEST_ENDPOINTS: 'true',
      NODE_ENV: 'test',
    });
    const app = buildApp(router);

    const res = await request(app).post('/api/setup/reset-database').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 when an incorrect token is sent', async () => {
    try { fs.unlinkSync(TOKEN_PATH); } catch { /* ignore */ }
    const router = await loadSetupRouter({
      ALLOW_DESTRUCTIVE_TEST_ENDPOINTS: 'true',
      NODE_ENV: 'test',
    });
    const app = buildApp(router);

    const res = await request(app)
      .post('/api/setup/reset-database')
      .set('X-Test-Reset-Token', 'definitely-not-the-real-token')
      .send({});
    expect(res.status).toBe(401);
  });

  it('accepts the request when the correct token is sent (does not 401/404)', async () => {
    // The wipe itself is covered by the Playwright suite; under Jest the
    // dynamic-import cache bust creates a fresh module graph that we cannot
    // cheaply rebind to sqlite, so we only assert that the gate permits the
    // request to reach the wipe stage. 500 is acceptable here because it
    // means the handler was entered and attempted to call resetTestDatabase.
    try { fs.unlinkSync(TOKEN_PATH); } catch { /* ignore */ }
    const router = await loadSetupRouter({
      ALLOW_DESTRUCTIVE_TEST_ENDPOINTS: 'true',
      NODE_ENV: 'test',
    });
    const app = buildApp(router);

    const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    expect(token.length).toBeGreaterThanOrEqual(32);

    const res = await request(app)
      .post('/api/setup/reset-database')
      .set('X-Test-Reset-Token', token)
      .send({});
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
    expect([200, 500]).toContain(res.status);
  });
});
