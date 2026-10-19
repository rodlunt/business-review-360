/**
 * Issue #574 - sales enquiries route, post-rename.
 *
 * Mounts the renamed contact.js route against an in-memory SQLite Sequelize
 * instance (mocked in place of platformDatabase.js). Asserts the rename took
 * effect across SQL table name, response field names, and Resend categories.
 */
// User model (imported dynamically below) pulls in database.js, which builds
// a Sequelize instance from DATABASE_URL at module load time. Constructing it
// does not open a connection but Sequelize requires a non-empty URL string.
// Set the placeholder before any dynamic import so this test stays isolated
// from real config (the worktree may not carry a project-root .env).
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

import { jest } from '@jest/globals';
import { Sequelize } from 'sequelize';
import { allEmailTemplatesMock } from '../test-fixtures/email-template-mocks.js';

// Test sequelize instance must exist before the platformDatabase mock factory
// runs, otherwise the route will see undefined.
const testSequelize = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
  logging: false,
});

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: testSequelize,
  testPlatformConnection: jest.fn().mockResolvedValue(true),
}));

// #738: contact.js now routes through enqueueTemplateEmail (queue-backed)
// rather than sendTemplateEmail. The mocked EmailPriority mirrors the real
// enum so the importer's `EmailPriority.NORMAL` resolves at module load.
const enqueueTemplateEmailMock = jest.fn().mockResolvedValue({ success: true, queueId: 'queue_test' });
jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  enqueueTemplateEmail: enqueueTemplateEmailMock,
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));

// All *.jsx paths share one module slot (moduleNameMapper); one call suffices.
// allEmailTemplatesMock exports every template name so no factory is stale
// when new templates are added. Issue #703.
jest.unstable_mockModule('../../backend/src/emails/templates/admin/SalesNotification.jsx', allEmailTemplatesMock);

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// Dynamic import so the DATABASE_URL placeholder set at the top of this file
// (before any awaited import) is in scope when User -> database.js evaluates.
// Static imports are hoisted; that races the env shim and blanks DATABASE_URL.
const { default: User } = await import('../../backend/src/models/User.js');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-574-contact-sales';
process.env.JWT_SECRET = JWT_SECRET;

const adminUserId = 901;
const adminToken = jwt.sign(
  { id: adminUserId, organizationId: 'demo-corp' },
  JWT_SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

jest.spyOn(User, 'findByPk').mockImplementation(async (id) => {
  if (id === adminUserId) {
    return {
      id: adminUserId,
      username: 'sales-admin',
      isAdmin: true,
      organizationId: 'demo-corp',
    };
  }
  return null;
});

// #720: contact.js now exports publicRouter + protectedRouter.
const { publicRouter: contactPublic, protectedRouter: contactProtected } = await import('../../backend/src/routes/contact.js');
const { authenticate } = await import('../../backend/src/middleware/auth.js');

let app;

const validBody = {
  companyName: 'Acme Pty Ltd',
  contactName: 'Jane Smith',
  email: 'jane@acme.example',
  phone: '+61 2 5550 0000',
  companySize: '11-50',
  planInterest: 'enterprise',
  message: 'Looking for a custom plan.',
};

beforeAll(async () => {
  await testSequelize.query(`
    CREATE TABLE sales_enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      company_size TEXT NOT NULL,
      plan_interest TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      source TEXT DEFAULT 'pricing_page',
      notes TEXT,
      assigned_to TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      contacted_at DATETIME,
      closed_at DATETIME
    );
  `);

  // Issue #583: enforce one-enquiry-per-email-per-day. SQLite has no
  // date_trunc() but date() truncates a timestamp to YYYY-MM-DD, which is
  // semantically equivalent for the test. Postgres prod uses the equivalent
  // expression index (see db/platform-schema.sql and
  // db/patches/583-sales-enquiries-unique-day.sql).
  await testSequelize.query(`
    CREATE UNIQUE INDEX uniq_sales_enquiries_email_day
      ON sales_enquiries (email, date(created_at));
  `);

  app = express();
  app.use(express.json());
  app.use('/api/contact', contactPublic);
  app.use('/api/contact', authenticate, contactProtected);
});

beforeEach(async () => {
  await testSequelize.query('DELETE FROM sales_enquiries');
  enqueueTemplateEmailMock.mockClear();
});

afterAll(async () => {
  await testSequelize.close();
});

describe('Issue #574 - POST /api/contact/sales', () => {
  // Case 1 NOTE: the route uses INSERT ... RETURNING id. Sequelize's behaviour on
  // SQLite for RETURNING with QueryTypes.INSERT is dialect-dependent. If this case
  // fails after the Task 2 rename with a 500 (rather than the expected 201), the
  // plan's documented fallback applies: assert on row count via the SELECT below
  // instead of res.body.enquiryId. See docs/superpowers/plans/2026-04-25-574-sales-enquiries-rename.md.
  it('case 1: happy path returns 201 with enquiryId and persists row', async () => {
    const res = await request(app).post('/api/contact/sales').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.enquiryId).toBeDefined();
    expect(res.body.inquiryId).toBeUndefined();

    const [rows] = await testSequelize.query('SELECT * FROM sales_enquiries');
    expect(rows).toHaveLength(1);
    expect(rows[0].company_name).toBe('Acme Pty Ltd');
  });

  it('case 2: missing companyName returns 400 / MISSING_COMPANY_NAME', async () => {
    const res = await request(app)
      .post('/api/contact/sales')
      .send({ ...validBody, companyName: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_COMPANY_NAME');
  });

  it('case 3: missing contactName returns 400 / MISSING_CONTACT_NAME', async () => {
    const res = await request(app)
      .post('/api/contact/sales')
      .send({ ...validBody, contactName: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_CONTACT_NAME');
  });

  it('case 4: missing email returns 400 / MISSING_EMAIL', async () => {
    const res = await request(app)
      .post('/api/contact/sales')
      .send({ ...validBody, email: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_EMAIL');
  });

  it('case 5: invalid email format returns 400 / INVALID_EMAIL', async () => {
    const res = await request(app)
      .post('/api/contact/sales')
      .send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL');
  });

  it('case 6: missing companySize returns 400 / MISSING_COMPANY_SIZE', async () => {
    const res = await request(app)
      .post('/api/contact/sales')
      .send({ ...validBody, companySize: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_COMPANY_SIZE');
  });

  it('case 7: missing planInterest returns 400 / MISSING_PLAN_INTEREST', async () => {
    const res = await request(app)
      .post('/api/contact/sales')
      .send({ ...validBody, planInterest: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_PLAN_INTEREST');
  });

  it('case 8: happy path triggers email mock with categories ["sales", "enquiry"]', async () => {
    process.env.SALES_NOTIFICATION_EMAIL = 'sales-test@example.com';
    try {
      await request(app).post('/api/contact/sales').send(validBody);
      expect(enqueueTemplateEmailMock).toHaveBeenCalledTimes(1);
      const callArgs = enqueueTemplateEmailMock.mock.calls[0][0];
      expect(callArgs.categories).toEqual(['sales', 'enquiry']);
      // #738 + reviewer follow-up: contact form sales enquiries are platform
      // level (no tenant) so organizationId is intentionally null. Asserting
      // the field is present catches accidental drift if a refactor adds a
      // tenant-scoped sales path without updating the call site.
      expect(callArgs.type).toBe('sales-enquiry');
      expect(callArgs.organizationId).toBeNull();
      expect(callArgs.replyTo).toBe(validBody.email.toLowerCase());
    } finally {
      delete process.env.SALES_NOTIFICATION_EMAIL;
    }
  });
});

describe('Issue #574 - GET /api/contact/sales', () => {
  it('case 9: admin GET returns enquiries array (renamed from inquiries)', async () => {
    await testSequelize.query(`
      INSERT INTO sales_enquiries
        (company_name, contact_name, email, company_size, plan_interest)
      VALUES ('Beta Corp', 'Alex Lee', 'alex@beta.example', '51-200', 'pro');
    `);

    const res = await request(app)
      .get('/api/contact/sales')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.enquiries).toBeDefined();
    expect(res.body.inquiries).toBeUndefined();
    expect(res.body.enquiries).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('case 10: GET without auth returns 401', async () => {
    const res = await request(app).get('/api/contact/sales');
    expect(res.status).toBe(401);
  });
});

describe('Issue #583 - duplicate same-day enquiries return 409', () => {
  it('case 11: second POST same email same day returns 409 / DUPLICATE_ENQUIRY', async () => {
    const first = await request(app).post('/api/contact/sales').send(validBody);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/contact/sales').send(validBody);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_ENQUIRY');

    const [rows] = await testSequelize.query(
      'SELECT COUNT(*) AS c FROM sales_enquiries WHERE email = :email',
      { replacements: { email: validBody.email } }
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it('case 12: same email next day returns 201 (constraint scoped to day)', async () => {
    // Seed a prior-day row directly so the unique key on
    // (email, date(created_at)) does not collide with todays POST.
    await testSequelize.query(
      `INSERT INTO sales_enquiries
         (company_name, contact_name, email, company_size, plan_interest, status, created_at, updated_at)
       VALUES (:companyName, :contactName, :email, :companySize, :planInterest, 'new',
               '2020-01-01 09:00:00', '2020-01-01 09:00:00')`,
      {
        replacements: {
          companyName: validBody.companyName,
          contactName: validBody.contactName,
          email: validBody.email,
          companySize: validBody.companySize,
          planInterest: validBody.planInterest,
        },
      }
    );

    const res = await request(app).post('/api/contact/sales').send(validBody);
    expect(res.status).toBe(201);

    const [rows] = await testSequelize.query(
      'SELECT COUNT(*) AS c FROM sales_enquiries WHERE email = :email',
      { replacements: { email: validBody.email } }
    );
    expect(Number(rows[0].c)).toBe(2);
  });
});
