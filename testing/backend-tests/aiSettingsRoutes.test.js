/**
 * Tests for HTTP layer of /api/ai-settings routes:
 *   GET  /api/ai-settings             (admin only)
 *   PUT  /api/ai-settings             (admin only)
 *   POST /api/ai-settings/validate    (admin only)
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

import User from '../../backend/src/models/User.js';
import Organization from '../../backend/src/models/Organization.js';

const encryptApiKeyMock = jest.fn((key) => `enc:${key}`);
const resolveProviderMock = jest.fn();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: jest.fn() },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/adapters/ai/index.js', () => ({
  encryptApiKey: encryptApiKeyMock,
  resolveProvider: resolveProviderMock,
}));

jest.unstable_mockModule('../../backend/src/adapters/ai/anthropic.js', () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockResolvedValue({ valid: true, model: 'claude-3' }),
  })),
}));

jest.unstable_mockModule('../../backend/src/adapters/ai/openai.js', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockResolvedValue({ valid: true, model: 'gpt-4' }),
  })),
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-ai-settings-tests';

const adminId   = 'cccccccc-cccc-4ccc-8ccc-100000000001';
const regularId = 'cccccccc-cccc-4ccc-8ccc-100000000002';
const orgHandle = 'ai-settings-test-org';

const adminToken = jwt.sign(
  { id: adminId, username: 'aiadmin', isAdmin: true, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const regularToken = jwt.sign(
  { id: regularId, username: 'airegular', isAdmin: false, organizationId: orgHandle },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const testUsers = {
  [adminId]:   { id: adminId,   username: 'aiadmin',   isAdmin: true,  organizationId: orgHandle },
  [regularId]: { id: regularId, username: 'airegular', isAdmin: false, organizationId: orgHandle },
};

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => testUsers[id] || null);

const orgFindOneSpy  = jest.spyOn(Organization, 'findOne');

const { default: aiSettingsRoutes } = await import('../../backend/src/routes/aiSettings.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use('/api/ai-settings', authenticate, aiSettingsRoutes);

const makeOrg = (overrides = {}) => ({
  aiMode: 'disabled',
  aiProvider: null,
  aiApiKeyEncrypted: null,
  update: jest.fn(async function (fields) { Object.assign(this, fields); }),
  ...overrides,
});

beforeEach(() => {
  orgFindOneSpy.mockReset();
  encryptApiKeyMock.mockClear();
  resolveProviderMock.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/ai-settings
// ---------------------------------------------------------------------------

describe('GET /api/ai-settings', () => {
  it('returns 200 with aiMode, aiProvider and hasApiKey for an admin', async () => {
    orgFindOneSpy.mockResolvedValueOnce(makeOrg({ aiMode: 'byo', aiProvider: 'anthropic', aiApiKeyEncrypted: 'enc:xxx' }));

    const res = await request(app)
      .get('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.aiMode).toBe('byo');
    expect(res.body.aiProvider).toBe('anthropic');
    expect(res.body.hasApiKey).toBe(true);
  });

  it('defaults aiMode to disabled when org has no setting', async () => {
    orgFindOneSpy.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.aiMode).toBe('disabled');
    expect(res.body.hasApiKey).toBe(false);
  });

  it('returns 403 FORBIDDEN when called by a non-admin', async () => {
    const res = await request(app)
      .get('/api/ai-settings')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/ai-settings');
    expect(res.status).toBe(401);
  });

  it('returns 500 when Organization.findOne throws', async () => {
    orgFindOneSpy.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .get('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/ai-settings
// ---------------------------------------------------------------------------

describe('PUT /api/ai-settings', () => {
  it('returns 200 success when setting aiMode to disabled', async () => {
    const org = makeOrg();
    orgFindOneSpy.mockResolvedValueOnce(org);

    const res = await request(app)
      .put('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiMode: 'disabled' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(org.update).toHaveBeenCalledWith(
      expect.objectContaining({ aiMode: 'disabled', aiProvider: null, aiApiKeyEncrypted: null })
    );
  });

  it('saves encrypted key when aiMode is byo with a provided apiKey', async () => {
    const org = makeOrg();
    orgFindOneSpy.mockResolvedValueOnce(org);

    const res = await request(app)
      .put('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiMode: 'byo', aiProvider: 'anthropic', apiKey: 'sk-test-key' });

    expect(res.status).toBe(200);
    expect(encryptApiKeyMock).toHaveBeenCalledWith('sk-test-key');
    expect(org.update).toHaveBeenCalledWith(
      expect.objectContaining({ aiMode: 'byo', aiProvider: 'anthropic', aiApiKeyEncrypted: 'enc:sk-test-key' })
    );
  });

  it('returns 400 VALIDATION_ERROR for an invalid aiMode', async () => {
    const res = await request(app)
      .put('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiMode: 'invalid-mode' });

    expect(res.status).toBe(400);
  });

  it('returns 400 VALIDATION_ERROR for byo mode without a valid aiProvider', async () => {
    const res = await request(app)
      .put('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiMode: 'byo', aiProvider: 'unknown-provider' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .put('/api/ai-settings')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ aiMode: 'disabled' });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).put('/api/ai-settings').send({ aiMode: 'disabled' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai-settings/validate
// ---------------------------------------------------------------------------

describe('POST /api/ai-settings/validate', () => {
  it('validates an in-flight anthropic key and returns { valid: true }', async () => {
    const res = await request(app)
      .post('/api/ai-settings/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ apiKey: 'sk-anth-test', aiProvider: 'anthropic' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('validates an in-flight openai key and returns { valid: true }', async () => {
    const res = await request(app)
      .post('/api/ai-settings/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ apiKey: 'sk-oai-test', aiProvider: 'openai' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('validates the currently configured key when no apiKey is sent', async () => {
    const mockProvider = { validate: jest.fn().mockResolvedValue({ valid: true }) };
    resolveProviderMock.mockResolvedValueOnce(mockProvider);

    const res = await request(app)
      .post('/api/ai-settings/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(mockProvider.validate).toHaveBeenCalled();
  });

  it('returns { valid: false } when validation throws', async () => {
    resolveProviderMock.mockRejectedValueOnce(new Error('Invalid key'));

    const res = await request(app)
      .post('/api/ai-settings/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBe('Invalid key');
  });

  it('returns 403 when called by a non-admin', async () => {
    const res = await request(app)
      .post('/api/ai-settings/validate')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ apiKey: 'sk-test', aiProvider: 'anthropic' });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/ai-settings/validate').send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Cross-tenant isolation -- requireSameOrganization gate
// ---------------------------------------------------------------------------

describe('aiSettings cross-tenant -- requireSameOrganization', () => {
  it('GET returns 403 TENANT_MISMATCH when ?organizationId differs from JWT org', async () => {
    const res = await request(app)
      .get('/api/ai-settings')
      .query({ organizationId: 'different-org' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('PUT returns 403 TENANT_MISMATCH when body organizationId differs from JWT org', async () => {
    const res = await request(app)
      .put('/api/ai-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ aiMode: 'disabled', organizationId: 'different-org' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('POST /validate returns 403 TENANT_MISMATCH when body organizationId differs from JWT org', async () => {
    const res = await request(app)
      .post('/api/ai-settings/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ apiKey: 'sk-test', aiProvider: 'anthropic', organizationId: 'different-org' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });
});
