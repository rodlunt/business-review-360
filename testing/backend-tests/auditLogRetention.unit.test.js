/**
 * Issue #590 — audit log retention unit tests.
 *
 * Mocks the database layer entirely. Verifies env-var resolution,
 * kill-switch handling, cutoff calculation, the COUNT-then-DELETE
 * sequence, and the self-audit row write/skip logic.
 *
 * Integration coverage against a real (sqlite) DB is in the
 * companion auditLogRetention.integration.test.js file.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const queryMock = jest.fn();
const auditCreateMock = jest.fn().mockResolvedValue();

jest.unstable_mockModule('../../backend/src/models/platformDatabase.js', () => ({
  platformSequelize: { query: queryMock },
  queryPlatform: jest.fn(),
  testPlatformConnection: jest.fn(),
}));

jest.unstable_mockModule('../../backend/src/middleware/auditLog.js', () => ({
  AuditLog: { create: auditCreateMock },
}));

const {
  resolveRetentionDays,
  resolveCronExpression,
  isPruneEnabled,
  isAuditLoggingDisabled,
  pruneOnce,
} = await import('../../backend/src/jobs/auditLogRetention.js');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  queryMock.mockReset();
  auditCreateMock.mockReset();
  auditCreateMock.mockResolvedValue();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
  delete process.env.AUDIT_LOG_PRUNE_CRON;
  delete process.env.AUDIT_LOG_PRUNE_ENABLED;
  delete process.env.ENABLE_AUDIT_LOGGING;
  process.env.NODE_ENV = 'production';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Issue #590 - resolveRetentionDays', () => {
  it('defaults to 90 when env var is unset', () => {
    expect(resolveRetentionDays()).toBe(90);
  });

  it('parses valid integer env var', () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = '30';
    expect(resolveRetentionDays()).toBe(30);
  });

  it('falls back to 90 on non-numeric env var', () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = 'potato';
    expect(resolveRetentionDays()).toBe(90);
  });

  it('falls back to 90 on zero or negative', () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = '0';
    expect(resolveRetentionDays()).toBe(90);
    process.env.AUDIT_LOG_RETENTION_DAYS = '-5';
    expect(resolveRetentionDays()).toBe(90);
  });
});

describe('Issue #590 - resolveCronExpression', () => {
  it("defaults to '0 3 * * *' when env var is unset", () => {
    expect(resolveCronExpression()).toBe('0 3 * * *');
  });

  it('honours custom env var', () => {
    process.env.AUDIT_LOG_PRUNE_CRON = '*/5 * * * *';
    expect(resolveCronExpression()).toBe('*/5 * * * *');
  });
});

describe('Issue #590 - isPruneEnabled', () => {
  it('returns true in production when env unset', () => {
    process.env.NODE_ENV = 'production';
    expect(isPruneEnabled()).toBe(true);
  });

  it('returns false in development when env unset', () => {
    process.env.NODE_ENV = 'development';
    expect(isPruneEnabled()).toBe(false);
  });

  it("returns true on explicit 'true'", () => {
    process.env.NODE_ENV = 'development';
    process.env.AUDIT_LOG_PRUNE_ENABLED = 'true';
    expect(isPruneEnabled()).toBe(true);
  });

  it("returns false on explicit 'false'", () => {
    process.env.NODE_ENV = 'production';
    process.env.AUDIT_LOG_PRUNE_ENABLED = 'false';
    expect(isPruneEnabled()).toBe(false);
  });
});

describe('Issue #590 - isAuditLoggingDisabled', () => {
  it("returns true when ENABLE_AUDIT_LOGGING='false'", () => {
    process.env.ENABLE_AUDIT_LOGGING = 'false';
    expect(isAuditLoggingDisabled()).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isAuditLoggingDisabled()).toBe(false);
    process.env.ENABLE_AUDIT_LOGGING = 'true';
    expect(isAuditLoggingDisabled()).toBe(false);
  });
});

describe('Issue #590 - pruneOnce skip paths', () => {
  it('skips when ENABLE_AUDIT_LOGGING=false', async () => {
    process.env.ENABLE_AUDIT_LOGGING = 'false';
    const result = await pruneOnce();
    expect(result.skipped).toBe('audit-disabled');
    expect(queryMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('skips when AUDIT_LOG_PRUNE_ENABLED=false', async () => {
    process.env.AUDIT_LOG_PRUNE_ENABLED = 'false';
    const result = await pruneOnce();
    expect(result.skipped).toBe('prune-disabled');
    expect(queryMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });
});

describe('Issue #590 - pruneOnce DELETE path', () => {
  it('runs COUNT query with correct cutoff replacement (zero-row case skips DELETE)', async () => {
    queryMock.mockResolvedValueOnce([{ count: '0' }]);

    const before = Date.now();
    await pruneOnce();
    const after = Date.now();

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, opts] = queryMock.mock.calls[0];
    expect(sql).toMatch(/SELECT COUNT\(\*\)/i);
    expect(sql).toMatch(/created_at < :cutoff/);
    const cutoffMs = Date.parse(opts.replacements.cutoff);
    const expectedMin = before - 90 * 86400000 - 1000;
    const expectedMax = after - 90 * 86400000 + 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });

  it('honours custom retention days', async () => {
    process.env.AUDIT_LOG_RETENTION_DAYS = '7';
    queryMock.mockResolvedValueOnce([{ count: '0' }]);

    const before = Date.now();
    await pruneOnce();
    const after = Date.now();

    const [, opts] = queryMock.mock.calls[0];
    const cutoffMs = Date.parse(opts.replacements.cutoff);
    const expectedMin = before - 7 * 86400000 - 1000;
    const expectedMax = after - 7 * 86400000 + 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });

  it('issues DELETE only when count > 0', async () => {
    queryMock
      .mockResolvedValueOnce([{ count: '3' }])
      .mockResolvedValueOnce([[], {}]);

    const result = await pruneOnce();

    expect(queryMock).toHaveBeenCalledTimes(2);
    const [deleteSql] = queryMock.mock.calls[1];
    expect(deleteSql).toMatch(/DELETE FROM audit_logs/i);
    expect(result.rowsDeleted).toBe(3);
  });
});

describe('Issue #590 - pruneOnce self-audit row', () => {
  it('writes maintenance.audit_log_pruned only when rowsDeleted > 0', async () => {
    queryMock
      .mockResolvedValueOnce([{ count: '5' }])
      .mockResolvedValueOnce([[], {}]);

    await pruneOnce();

    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const [args] = auditCreateMock.mock.calls[0];
    expect(args.action).toBe('maintenance.audit_log_pruned');
    expect(args.actor_email).toBe('system');
    expect(args.actor_role).toBe('system');
    expect(args.resource_type).toBe('audit_logs');
    expect(args.status).toBe('success');
    expect(args.metadata.rows_deleted).toBe(5);
    expect(args.metadata.retention_days).toBe(90);
    expect(args.metadata.cutoff_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does NOT write self-audit row when rowsDeleted === 0', async () => {
    queryMock.mockResolvedValueOnce([{ count: '0' }]);
    await pruneOnce();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });
});

describe('Issue #590 - pruneOnce error handling', () => {
  it('writes failure self-audit row on COUNT error and does not throw', async () => {
    queryMock.mockRejectedValueOnce(new Error('connection lost'));

    const result = await pruneOnce();

    expect(result.error).toBe('connection lost');
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const [args] = auditCreateMock.mock.calls[0];
    expect(args.status).toBe('failure');
    expect(args.metadata.error).toBe('connection lost');
  });

  it('writes failure self-audit row on DELETE error', async () => {
    queryMock
      .mockResolvedValueOnce([{ count: '3' }])
      .mockRejectedValueOnce(new Error('table locked'));

    const result = await pruneOnce();

    expect(result.error).toBe('table locked');
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const [args] = auditCreateMock.mock.calls[0];
    expect(args.status).toBe('failure');
    expect(args.metadata.error).toBe('table locked');
  });
});
