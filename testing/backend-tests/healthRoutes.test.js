/**
 * Tests for HTTP layer of /health routes:
 *   GET /health           (basic liveness, no auth)
 *   GET /health/live      (liveness probe)
 *   GET /health/metrics   (system metrics)
 *   GET /health/ready     (readiness probe — checks both DBs)
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const testConnectionMock = jest.fn();
const testPlatformConnectionMock = jest.fn();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  queryPlatform: jest.fn(),
  testPlatformConnection: testPlatformConnectionMock,
}));

jest.unstable_mockModule('../../backend/src/models/index.js', () => ({
  sequelize: {},
  testConnection: testConnectionMock,
}));

const { default: healthRoutes } = await import('../../backend/src/routes/health.js');

const app = express();
app.use(express.json());
app.use('/health', healthRoutes);

beforeEach(() => {
  testConnectionMock.mockReset();
  testPlatformConnectionMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok, timestamp and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.uptime).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// GET /health/live
// ---------------------------------------------------------------------------

describe('GET /health/live', () => {
  it('returns 200 with status alive and process info', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
    expect(res.body.pid).toBe(process.pid);
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// GET /health/metrics
// ---------------------------------------------------------------------------

describe('GET /health/metrics', () => {
  it('returns 200 with memory, cpu, uptime and environment', async () => {
    const res = await request(app).get('/health/metrics');
    expect(res.status).toBe(200);
    expect(res.body.uptime).toBeDefined();
    expect(res.body.nodeVersion).toBe(process.version);
    expect(res.body.pid).toBe(process.pid);
    expect(res.body.memory).toBeDefined();
    expect(typeof res.body.memory.rss).toBe('string');
    expect(res.body.cpu).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /health/ready
// ---------------------------------------------------------------------------

describe('GET /health/ready', () => {
  it('returns 200 ready when both DBs pass', async () => {
    testConnectionMock.mockResolvedValueOnce();
    testPlatformConnectionMock.mockResolvedValueOnce();

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.checks.platformDatabase).toBe('ok');
  });

  it('returns 503 when the main DB fails', async () => {
    testConnectionMock.mockRejectedValueOnce(new Error('Connection refused'));
    testPlatformConnectionMock.mockResolvedValueOnce();

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.database).toBe('error');
    expect(res.body.checks.databaseError).toBe('Connection refused');
  });

  it('returns 503 when the platform DB fails', async () => {
    testConnectionMock.mockResolvedValueOnce();
    testPlatformConnectionMock.mockRejectedValueOnce(new Error('Platform down'));

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.platformDatabase).toBe('error');
    expect(res.body.checks.platformDatabaseError).toBe('Platform down');
  });

  it('returns 503 when both DBs fail, with both error messages', async () => {
    testConnectionMock.mockRejectedValueOnce(new Error('Main DB timeout'));
    testPlatformConnectionMock.mockRejectedValueOnce(new Error('Platform timeout'));

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks.databaseError).toBe('Main DB timeout');
    expect(res.body.checks.platformDatabaseError).toBe('Platform timeout');
  });

  it('includes server: ok in all checks', async () => {
    testConnectionMock.mockResolvedValueOnce();
    testPlatformConnectionMock.mockResolvedValueOnce();

    const res = await request(app).get('/health/ready');
    expect(res.body.checks.server).toBe('ok');
  });
});
