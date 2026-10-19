/**
 * Issue #590 — audit log retention integration test.
 *
 * Uses an in-memory sqlite Sequelize instance for the platform DB
 * so the COUNT/DELETE queries actually run against a real engine.
 * AuditLog.create is mocked because its production SQL contains
 * Postgres-specific JSONB casts that sqlite does not understand.
 *
 * Real-Postgres harness coverage is filed as #591; when that lands,
 * port this test off sqlite.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { Sequelize, QueryTypes } from 'sequelize';

const sqlite = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

const auditCreateMock = jest.fn().mockResolvedValue();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: sqlite,
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  AuditLog: { create: auditCreateMock },
}));

const { triggerPrune } = await import('../../backend/src/jobs/auditLogRetention.js');

const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  await sqlite.query(`
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT,
      actor_id TEXT,
      actor_email TEXT,
      actor_role TEXT,
      tenant_id TEXT,
      resource_type TEXT,
      resource_id TEXT,
      changes TEXT,
      metadata TEXT,
      status TEXT,
      request_id TEXT,
      created_at TEXT
    )
  `);
});

beforeEach(async () => {
  await sqlite.query('DELETE FROM audit_logs');
  auditCreateMock.mockReset();
  auditCreateMock.mockResolvedValue();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
  delete process.env.AUDIT_LOG_PRUNE_ENABLED;
  delete process.env.ENABLE_AUDIT_LOGGING;
  process.env.NODE_ENV = 'production';
});

async function seed(rows) {
  for (const row of rows) {
    await sqlite.query(
      `INSERT INTO audit_logs (action, actor_email, status, created_at)
       VALUES (:action, :actor_email, :status, :created_at)`,
      {
        replacements: row,
        type: QueryTypes.INSERT,
      }
    );
  }
}

describe('Issue #590 - retention integration (sqlite)', () => {
  it('deletes only rows older than the retention cutoff', async () => {
    const now = Date.now();
    const oldIso = new Date(now - 100 * 86400000).toISOString();
    const freshIso = new Date(now - 10 * 86400000).toISOString();

    await seed([
      { action: 'auth.login', actor_email: 'a@x.com', status: 'failure', created_at: oldIso },
      { action: 'auth.login', actor_email: 'b@x.com', status: 'failure', created_at: oldIso },
      { action: 'auth.login', actor_email: 'c@x.com', status: 'failure', created_at: oldIso },
      { action: 'auth.login', actor_email: 'd@x.com', status: 'success', created_at: freshIso },
      { action: 'auth.login', actor_email: 'e@x.com', status: 'success', created_at: freshIso },
    ]);

    const result = await triggerPrune();

    expect(result.rowsDeleted).toBe(3);

    const survivors = await sqlite.query(
      'SELECT actor_email FROM audit_logs ORDER BY actor_email',
      { type: QueryTypes.SELECT }
    );
    expect(survivors.map((r) => r.actor_email)).toEqual(['d@x.com', 'e@x.com']);

    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const [args] = auditCreateMock.mock.calls[0];
    expect(args.action).toBe('maintenance.audit_log_pruned');
    expect(args.metadata.rows_deleted).toBe(3);
    expect(args.status).toBe('success');
  });

  it('writes no self-audit row when nothing is old enough', async () => {
    const freshIso = new Date(Date.now() - 5 * 86400000).toISOString();
    await seed([
      { action: 'auth.login', actor_email: 'x@x.com', status: 'success', created_at: freshIso },
      { action: 'auth.login', actor_email: 'y@x.com', status: 'success', created_at: freshIso },
    ]);

    const result = await triggerPrune();

    expect(result.rowsDeleted).toBe(0);
    expect(auditCreateMock).not.toHaveBeenCalled();

    const remaining = await sqlite.query('SELECT COUNT(*) AS n FROM audit_logs', {
      type: QueryTypes.SELECT,
    });
    expect(Number(remaining[0].n)).toBe(2);
  });

  it('honours AUDIT_LOG_RETENTION_DAYS=30', async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = '30';
    const now = Date.now();
    const fortyDays = new Date(now - 40 * 86400000).toISOString();
    const tenDays = new Date(now - 10 * 86400000).toISOString();

    await seed([
      { action: 'auth.login', actor_email: 'old@x.com', status: 'failure', created_at: fortyDays },
      { action: 'auth.login', actor_email: 'new@x.com', status: 'success', created_at: tenDays },
    ]);

    const result = await triggerPrune();

    expect(result.rowsDeleted).toBe(1);
    const survivors = await sqlite.query(
      'SELECT actor_email FROM audit_logs',
      { type: QueryTypes.SELECT }
    );
    expect(survivors.map((r) => r.actor_email)).toEqual(['new@x.com']);
  });
});
