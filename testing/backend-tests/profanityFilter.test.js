/**
 * Profanity Filter Backend Unit Tests
 *
 * UPDATED: 2025-11-05 for Epic #318 Phases 6, 7, 8 compatibility
 * - Tests profanity filter middleware and settings routes
 * - Compatible with centralized error handling (Phase 6 - Issue #335)
 * - Admin actions tested with audit logging support (Phase 7)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Sequelize } from 'sequelize';
import jwt from 'jsonwebtoken';

// Import User model FIRST to mock it before other imports
import User from '../../backend/src/models/User.js';

import Setting from '../../backend/src/models/Setting.js';
import { checkProfanity, validateProfanity, invalidateSettingsCache } from '../../backend/src/middleware/profanityFilter.js';

// Test database setup
let sequelize;
let app;
let testUsers = {}; // Store test users for mock lookup

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-multi-tenancy-tests';
const mockAdminToken = jwt.sign(
  { id: 1, username: 'admin', isAdmin: true, isSuperuser: true },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const mockAdminOnlyToken = jwt.sign(
  { id: 2, username: 'admin_only', isAdmin: true, isSuperuser: false },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// A superuser whose org is the shared demo org. Profanity writes are locked
// for demo-corp even though this user is a superuser.
const mockDemoSuperToken = jwt.sign(
  { id: 3, username: 'demo_super', isAdmin: true, isSuperuser: true, organizationId: 'demo-corp' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// Mock User.findByPk to return test users
jest.spyOn(User, 'findByPk').mockImplementation(async (id) => {
  return testUsers[id] || null;
});

// NOW import routes after mocking User.findByPk
const { default: profanitySettingsRoutes } = await import('../../backend/src/routes/profanitySettings.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

beforeAll(async () => {
  // Create in-memory SQLite database for testing.
  // Uses explicit options (not the `sqlite::memory:` URI) so the tests run on
  // Node 20 pinned by engines and on newer Nodes whose stricter WHATWG URL
  // parser rejects the URI form.
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });

  // Define Setting model for test
  Setting.init(
    {
      key: {
        type: Sequelize.STRING,
        primaryKey: true,
      },
      value: {
        type: Sequelize.TEXT,
      },
    },
    { sequelize, modelName: 'Setting', tableName: 'Settings' }
  );

  await sequelize.sync();

  // Create test admin user and store for the mock
  const adminUser = {
    id: 1,
    username: 'admin',
    email: 'admin@test.com',
    isAdmin: true,
    isSuperuser: true,
    organizationId: null,
    toJSON() { return this; }
  };

  testUsers[1] = adminUser;

  testUsers[2] = {
    id: 2,
    username: 'admin_only',
    email: 'admin_only@test.com',
    isAdmin: true,
    isSuperuser: false,
    organizationId: null,
    toJSON() { return this; }
  };

  testUsers[3] = {
    id: 3,
    username: 'demo_super',
    email: 'demo_super@test.com',
    isAdmin: true,
    isSuperuser: true,
    organizationId: 'demo-corp',
    toJSON() { return this; }
  };

  // Setup Express app for route testing
  app = express();
  app.use(express.json());

  // Now the real authenticate middleware will work because User.findByPk is mocked
  app.use('/api/profanity-settings', authenticate, profanitySettingsRoutes);
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  // Clear settings before each test
  await Setting.destroy({ where: {} });
  invalidateSettingsCache();
});

describe('Profanity Filter - checkProfanity function', () => {
  it('should detect profanity in text', async () => {
    const result = await checkProfanity('This is damn bad text');
    expect(result.isProfane).toBe(true);
    expect(result.cleanText).toContain('****');
  });

  it('should not detect profanity in clean text', async () => {
    const result = await checkProfanity('This is a nice clean message');
    expect(result.isProfane).toBe(false);
    expect(result.cleanText).toBe('This is a nice clean message');
  });

  it('should return clean text when filter is disabled', async () => {
    await Setting.create({
      key: 'profanityFilterEnabled',
      value: 'false',
    });

    const result = await checkProfanity('This is damn bad text');
    expect(result.isProfane).toBe(false);
    expect(result.cleanText).toBe('This is damn bad text');
  });

  it('should detect custom words', async () => {
    await Setting.create({
      key: 'profanityFilterEnabled',
      value: 'true',
    });
    await Setting.create({
      key: 'profanityCustomWords',
      value: JSON.stringify(['badword', 'forbidden']),
    });

    const result = await checkProfanity('This contains badword in it');
    expect(result.isProfane).toBe(true);
    expect(result.cleanText).toContain('*******');
  });

  it('should handle null or undefined text', async () => {
    const resultNull = await checkProfanity(null);
    expect(resultNull.isProfane).toBe(false);

    const resultUndefined = await checkProfanity(undefined);
    expect(resultUndefined.isProfane).toBe(false);
  });

  it('should handle empty string', async () => {
    const result = await checkProfanity('');
    expect(result.isProfane).toBe(false);
    expect(result.cleanText).toBe('');
  });

  it('should handle non-string input', async () => {
    const result = await checkProfanity(12345);
    expect(result.isProfane).toBe(false);
  });
});

describe('Profanity Filter - validateProfanity middleware', () => {
  it('should block request with profanity in validated fields', async () => {
    const middleware = validateProfanity(['title', 'description']);
    const req = {
      body: {
        title: 'This is damn bad',
        description: 'Clean text',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Profanity detected',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'title',
            message: expect.any(String),
          })
        ])
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow request with clean text', async () => {
    const middleware = validateProfanity(['title', 'description']);
    const req = {
      body: {
        title: 'Clean title',
        description: 'Clean description',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should skip validation when filter is disabled', async () => {
    await Setting.create({
      key: 'profanityFilterEnabled',
      value: 'false',
    });

    const middleware = validateProfanity(['title']);
    const req = {
      body: {
        title: 'This is damn text',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should handle missing fields gracefully', async () => {
    const middleware = validateProfanity(['title', 'description']);
    const req = {
      body: {
        title: 'Clean title',
        // description is missing
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should validate multiple fields with custom words', async () => {
    await Setting.create({
      key: 'profanityFilterEnabled',
      value: 'true',
    });
    await Setting.create({
      key: 'profanityCustomWords',
      value: JSON.stringify(['forbidden']),
    });

    const middleware = validateProfanity(['title', 'description']);
    const req = {
      body: {
        title: 'Clean title',
        description: 'This has forbidden word',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Profanity detected',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'description',
            message: expect.any(String),
          })
        ])
      })
    );
  });
});

describe('Profanity Settings API - GET /api/profanity-settings', () => {
  it('should return default settings when none exist', async () => {
    const response = await request(app)
      .get('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      customWords: [],
    });
  });

  it('should return saved settings', async () => {
    await Setting.create({
      key: 'profanityFilterEnabled',
      value: 'false',
    });
    await Setting.create({
      key: 'profanityCustomWords',
      value: JSON.stringify(['word1', 'word2']),
    });

    const response = await request(app)
      .get('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: false,
      customWords: ['word1', 'word2'],
    });
  });

  it('should require authentication', async () => {
    const response = await request(app).get('/api/profanity-settings');

    expect(response.status).toBe(401);
  });
});

describe('Profanity Settings API - POST /api/profanity-settings', () => {
  it('should save profanity filter settings', async () => {
    const response = await request(app)
      .post('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        enabled: true,
        customWords: ['badword1', 'badword2'],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const enabledSetting = await Setting.findOne({
      where: { key: 'profanityFilterEnabled' },
    });
    const customWordsSetting = await Setting.findOne({
      where: { key: 'profanityCustomWords' },
    });

    expect(enabledSetting.value).toBe('true');
    expect(JSON.parse(customWordsSetting.value)).toEqual(['badword1', 'badword2']);
  });

  it('returns 403 for a demo-corp superuser (profanity locked on demo org)', async () => {
    const response = await request(app)
      .post('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockDemoSuperToken}`)
      .send({ enabled: false, customWords: ['x'] });

    expect(response.status).toBe(403);
  });

  it('should normalize custom words to lowercase and trim', async () => {
    const response = await request(app)
      .post('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        enabled: true,
        customWords: ['  BadWord1  ', 'BADWORD2'],
      });

    expect(response.status).toBe(200);

    const customWordsSetting = await Setting.findOne({
      where: { key: 'profanityCustomWords' },
    });

    expect(JSON.parse(customWordsSetting.value)).toEqual(['badword1', 'badword2']);
  });

  it('should reject non-boolean enabled value', async () => {
    const response = await request(app)
      .post('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        enabled: 'yes',
        customWords: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('boolean');
  });

  it('should reject non-array customWords', async () => {
    const response = await request(app)
      .post('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        enabled: true,
        customWords: 'not-an-array',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('array');
  });

  it('should reject empty strings in customWords', async () => {
    const response = await request(app)
      .post('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        enabled: true,
        customWords: ['valid', '', 'another'],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('non-empty');
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .post('/api/profanity-settings')
      .send({
        enabled: true,
        customWords: [],
      });

    expect(response.status).toBe(401);
  });
});

describe('Profanity Settings API - POST /api/profanity-settings/test', () => {
  it('should test text for profanity', async () => {
    const response = await request(app)
      .post('/api/profanity-settings/test')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        text: 'This is damn text',
      });

    expect(response.status).toBe(200);
    expect(response.body.text).toBe('This is damn text');
    expect(response.body.isProfane).toBe(true);
    expect(response.body.cleanText).toContain('****');
  });

  it('should test clean text', async () => {
    const response = await request(app)
      .post('/api/profanity-settings/test')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        text: 'This is clean text',
      });

    expect(response.status).toBe(200);
    expect(response.body.isProfane).toBe(false);
    expect(response.body.cleanText).toBe('This is clean text');
  });

  it('should test with custom words', async () => {
    await Setting.create({
      key: 'profanityFilterEnabled',
      value: 'true',
    });
    await Setting.create({
      key: 'profanityCustomWords',
      value: JSON.stringify(['custombad']),
    });

    const response = await request(app)
      .post('/api/profanity-settings/test')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({
        text: 'This has custombad word',
      });

    expect(response.status).toBe(200);
    expect(response.body.isProfane).toBe(true);
  });

  it('should reject missing text', async () => {
    const response = await request(app)
      .post('/api/profanity-settings/test')
      .set('Authorization', `Bearer ${mockAdminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('text is required');
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .post('/api/profanity-settings/test')
      .send({
        text: 'test',
      });

    expect(response.status).toBe(401);
  });
});

describe('Profanity Settings API -- permission guards', () => {
  it('GET returns 403 when called by a non-admin', async () => {
    const nonAdminToken = jwt.sign(
      { id: 3, username: 'regular', isAdmin: false, isSuperuser: false },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testUsers[3] = { id: 3, username: 'regular', isAdmin: false, isSuperuser: false, organizationId: null, toJSON() { return this; } };

    const res = await request(app)
      .get('/api/profanity-settings')
      .set('Authorization', `Bearer ${nonAdminToken}`);

    expect(res.status).toBe(403);
  });

  it('POST returns 403 when called by an admin without superuser', async () => {
    const res = await request(app)
      .post('/api/profanity-settings')
      .set('Authorization', `Bearer ${mockAdminOnlyToken}`)
      .send({ enabled: true, customWords: [] });

    expect(res.status).toBe(403);
  });
});

describe('Settings Cache', () => {
  it('should cache settings and refresh after TTL', async () => {
    await Setting.create({
      key: 'profanityFilterEnabled',
      value: 'true',
    });

    // First call - should load from database
    const result1 = await checkProfanity('test');
    expect(result1).toBeDefined();

    // Update setting in database
    await Setting.update(
      { value: 'false' },
      { where: { key: 'profanityFilterEnabled' } }
    );

    // Second call - should use cache, still enabled
    const result2 = await checkProfanity('damn text');
    expect(result2.isProfane).toBe(true); // Still using cached enabled=true

    // Invalidate cache
    invalidateSettingsCache();

    // Third call - should reload from database, now disabled
    const result3 = await checkProfanity('damn text');
    expect(result3.isProfane).toBe(false); // Now using updated disabled setting
  });
});
