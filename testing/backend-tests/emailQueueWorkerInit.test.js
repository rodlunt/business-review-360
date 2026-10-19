/**
 * Issue #747 -- EmailQueue worker registers regardless of DIGEST_ENABLED.
 *
 * Acceptance criterion (from the issue body):
 *   "Queue processor registers on backend startup regardless of
 *    DIGEST_ENABLED value"
 *   "Architectural test: digestScheduler.js does not import processQueue
 *    or EmailQueue model"
 *
 * Background: PR #743 routed every transactional email through EmailQueue.
 * The queue worker (`processQueue`) was registered inside digestScheduler.js,
 * gated behind DIGEST_ENABLED=true. Until 2026-05-02 prod ran with
 * DIGEST_ENABLED=false, so every transactional send sat in the queue
 * unattended. This test set locks in the decoupling: the worker must
 * initialise and register its cron jobs even when digest scheduling is off.
 *
 * The integration test mocks node-cron so the real timer doesn't keep the
 * Jest process alive after the assertions complete.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// --- mocks --------------------------------------------------------------------

const scheduleCalls = [];
const fakeJob = { stop: jest.fn() };

jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: (expression, _handler, options) => {
      scheduleCalls.push({ expression, options });
      return fakeJob;
    },
  },
}));

jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  processQueue: jest.fn().mockResolvedValue({ processed: 0, sent: 0, failed: 0 }),
  cleanupOldEntries: jest.fn().mockResolvedValue(0),
  monitorQueueHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  recoverStuckSending: jest.fn().mockResolvedValue(0),
  batchDigestEmails: jest.fn().mockResolvedValue({}),
  enqueueTemplateEmail: jest.fn().mockResolvedValue({ success: true }),
  EmailPriority: { CRITICAL: 1, HIGH: 3, NORMAL: 5, LOW: 7, BATCH: 9 },
}));

jest.unstable_mockModule('../../backend/src/services/emailAnalyticsService.js', () => ({
  runDailyAggregation: jest.fn().mockResolvedValue({ organizations: 0 }),
  cleanupOldLogs: jest.fn().mockResolvedValue(0),
}));

// emailQueueWorker imports trialReminderJob which imports .jsx templates.
// All .jsx paths resolve to the same module slot via moduleNameMapper; one
// factory must export every name the import chain needs.
jest.unstable_mockModule(
  '../../backend/src/emails/templates/notifications/TrialReminder.jsx',
  () => ({
    default: () => null,
    TrialReminder: () => null,
    TrialExpired: () => null,
    TrialWelcome: () => null,
  }),
);

jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const {
  initializeEmailQueueWorker,
  getEmailQueueWorkerStatus,
  stopEmailQueueWorker,
} = await import('../../backend/src/jobs/emailQueueWorker.js');

// --- tests --------------------------------------------------------------------

describe('Issue #747 -- emailQueueWorker registers independent of DIGEST_ENABLED', () => {
  const originalDigestEnabled = process.env.DIGEST_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    scheduleCalls.length = 0;
    fakeJob.stop.mockClear();
  });

  afterEach(() => {
    stopEmailQueueWorker();
    if (originalDigestEnabled === undefined) {
      delete process.env.DIGEST_ENABLED;
    } else {
      process.env.DIGEST_ENABLED = originalDigestEnabled;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('registers the queue processor when DIGEST_ENABLED=false', async () => {
    process.env.DIGEST_ENABLED = 'false';
    process.env.NODE_ENV = 'production';

    await initializeEmailQueueWorker();

    const status = getEmailQueueWorkerStatus();
    expect(status.jobs.queueProcessor).toBe('running');

    const queueCron = scheduleCalls.find((c) => c.expression === '* * * * *');
    expect(queueCron).toBeDefined();
  });

  it('registers the queue processor when DIGEST_ENABLED is unset', async () => {
    delete process.env.DIGEST_ENABLED;
    process.env.NODE_ENV = 'production';

    await initializeEmailQueueWorker();

    const status = getEmailQueueWorkerStatus();
    expect(status.jobs.queueProcessor).toBe('running');
    expect(status.jobs.queueCleanup).toBe('running');
    expect(status.jobs.healthMonitor).toBe('running');
    expect(status.jobs.analyticsAggregation).toBe('running');
    expect(status.jobs.logCleanup).toBe('running');
  });

  it('schedules queueProcessor at every-minute cadence', async () => {
    await initializeEmailQueueWorker();

    const queueCron = scheduleCalls.find((c) => c.expression === '* * * * *');
    expect(queueCron).toBeDefined();
  });
});

// --- architectural test -------------------------------------------------------

describe('Issue #747 -- digestScheduler no longer owns queue infrastructure', () => {
  it('does not import processQueue, cleanupOldEntries, monitorQueueHealth, runDailyAggregation, or cleanupOldLogs', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const digestSchedulerPath = path.resolve(
      here,
      '../../backend/src/jobs/digestScheduler.js',
    );
    const source = await readFile(digestSchedulerPath, 'utf8');

    // The digest scheduler still imports batchDigestEmails (a digest concern).
    // It must NOT import any of the worker-owned symbols.
    expect(source).not.toMatch(/\bprocessQueue\b/);
    expect(source).not.toMatch(/\bcleanupOldEntries\b/);
    expect(source).not.toMatch(/\bmonitorQueueHealth\b/);
    expect(source).not.toMatch(/\brunDailyAggregation\b/);
    expect(source).not.toMatch(/\bcleanupOldLogs\b/);

    // And it must not import the EmailQueue model directly.
    expect(source).not.toMatch(/from\s+['"][^'"]*models\/EmailQueue['"]/);
  });
});
