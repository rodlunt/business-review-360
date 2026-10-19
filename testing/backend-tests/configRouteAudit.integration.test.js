/**
 * Issue #588 — config-route audit integration test.
 *
 * Mounts the categories router on a test Express app, exercises
 * CREATE / UPDATE / DELETE / failure paths, and asserts that the
 * AuditLog.create mock was invoked with the expected changes shape.
 *
 * Real Sequelize against in-memory sqlite for the Category model;
 * AuditLog.create is mocked because its production SQL has Postgres-
 * only JSONB casts. Real-Postgres harness coverage tracked in #591.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { Sequelize, DataTypes, QueryTypes } from 'sequelize';
import express from 'express';
import request from 'supertest';

const sqlite = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

const auditCreateMock = jest.fn().mockResolvedValue();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: sqlite,
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

const Category = sqlite.define(
  'Category',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    organizationId: { type: DataTypes.STRING, allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    tenant_id: { type: DataTypes.STRING, allowNull: true },
    // api_key is added here to exercise the redactForAudit pipeline.
    // Production Category does NOT have this column; this is test-only.
    api_key: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'categories', timestamps: false }
);

jest.unstable_mockModule('../../backend/src/models/Category.js', () => ({
  default: Category,
}));

jest.unstable_mockModule('../../backend/src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 1,
      email: 'admin@x.com',
      isAdmin: true,
      organizationId: 'org-1',
      tenant_id: 'tenant-1',
    };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

const auditLogModule = await import('../../backend/src/middleware/auditLog.js');
const { AuditLog } = auditLogModule;
AuditLog.create = auditCreateMock;

const { default: categoriesRoutes } = await import('../../backend/src/routes/categories.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;

beforeAll(async () => {
  await Category.sync();
  app = express();
  app.use(express.json());
  app.use('/api/categories', authenticate, categoriesRoutes);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
});

beforeEach(async () => {
  await Category.destroy({ where: {}, truncate: true });
  auditCreateMock.mockReset();
  auditCreateMock.mockResolvedValue();
});

describe('Issue #588 - configRouteAudit integration (sqlite)', () => {
  it('writes a category.create audit row with before:null and after:<row>', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name: 'Marketing', description: 'Campaigns' });

    expect(res.status).toBe(201);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const args = auditCreateMock.mock.calls[0][0];
    expect(args.action).toBe('category.create');
    expect(args.status).toBe('success');
    expect(args.changes.before).toBeNull();
    expect(args.changes.after).toMatchObject({
      name: 'Marketing',
      description: 'Campaigns',
    });
  });

  it('writes a category.update audit row with both before and after populated', async () => {
    const created = await Category.create({
      name: 'Marketing',
      description: 'Old',
      organizationId: 'org-1',
    });

    const res = await request(app)
      .put(`/api/categories/${created.id}`)
      .send({ description: 'New' });

    expect(res.status).toBe(200);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const args = auditCreateMock.mock.calls[0][0];
    expect(args.action).toBe('category.update');
    expect(args.status).toBe('success');
    expect(args.changes.before.description).toBe('Old');
    expect(args.changes.after.description).toBe('New');
  });

  it('writes a category.delete audit row with after:null', async () => {
    const created = await Category.create({
      name: 'Marketing',
      organizationId: 'org-1',
    });

    const res = await request(app).delete(`/api/categories/${created.id}`);

    expect(res.status).toBe(200);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const args = auditCreateMock.mock.calls[0][0];
    expect(args.action).toBe('category.delete');
    expect(args.status).toBe('success');
    expect(args.changes.before).toMatchObject({ name: 'Marketing' });
    expect(args.changes.after).toBeNull();
  });

  it('does NOT write an audit row when the create handler validation rejects (missing name)', async () => {
    // Per spec D5 known limitation: validation-stage rejections that fire
    // res.status(400).json(...) before reaching the try/catch block are NOT audited.
    const res = await request(app).post('/api/categories').send({});

    expect(res.status).toBe(400);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('redacts sensitive fields from the changes payload', async () => {
    // Seed a category with a sensitive-named column. The test Category
    // model has an api_key column (production Category does not — this
    // simulates a future schema that adds a redact-worthy field).
    const created = await Category.create({
      name: 'Marketing',
      organizationId: 'org-1',
      api_key: 'secret-key-value',
    });

    const res = await request(app).delete(`/api/categories/${created.id}`);

    expect(res.status).toBe(200);
    const args = auditCreateMock.mock.calls[0][0];
    expect(args.changes.before.api_key).toBe('[REDACTED]');
    expect(args.changes.before.name).toBe('Marketing');
  });
});
