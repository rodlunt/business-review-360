/**
 * Issue #815 / #735 regression -- the email queue health monitor must push a
 * ntfy alert when the queue goes 'critical', not just write a log line.
 *
 * Background: the #735 incident was Resend bouncing every send for an unknown
 * number of weeks. It went unnoticed because every layer of the email path
 * (sendEmail.js catch, handleSendFailure, the healthMonitor cron) only called
 * logger.*; nothing alerted. monitorQueueHealth() returns status 'critical'
 * precisely when the failure rate exceeds 10%, which is exactly the
 * mass-bounce signature. This test locks in that a 'critical' status fires
 * notifyError, and that 'healthy' / 'warning' do NOT (warning is operational
 * noise -- backlog, stale rows, low rate limit -- and alerting on it would
 * cause alert fatigue).
 *
 * node-cron is mocked so the real timer does not keep Jest alive and so the
 * scheduled handler can be invoked directly.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// --- mocks --------------------------------------------------------------------

const scheduleCalls = [];
const fakeJob = { stop: jest.fn() };

jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: (expression, handler, options) => {
      scheduleCalls.push({ expression, handler, options });
      return fakeJob;
    },
  },
}));

const monitorQueueHealth = jest.fn().mockResolvedValue({ status: 'healthy' });

jest.unstable_mockModule('../../backend/src/services/emailQueueService.js', () => ({
  processQueue: jest.fn().mockResolvedValue({ processed: 0, sent: 0, failed: 0 }),
  cleanupOldEntries: jest.fn().mockResolvedValue(0),
  monitorQueueHealth,
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

const notifyError = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../backend/src/utils/ntfy.js', () => ({
  notifyError,
  notifyEvent: jest.fn().mockResolvedValue(undefined),
}));

const { initializeEmailQueueWorker, stopEmailQueueWorker } = await import(
  '../../backend/src/jobs/emailQueueWorker.js'
);

// --- helpers ------------------------------------------------------------------

const HEALTH_CRON = '*/5 * * * *';

async function runHealthMonitorTick() {
  await initializeEmailQueueWorker();
  const healthJob = scheduleCalls.find((c) => c.expression === HEALTH_CRON);
  expect(healthJob).toBeDefined();
  expect(typeof healthJob.handler).toBe('function');
  await healthJob.handler();
}

// --- tests --------------------------------------------------------------------

describe('Issue #815 -- queue healthMonitor alerts on critical status', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    scheduleCalls.length = 0;
    fakeJob.stop.mockClear();
    notifyError.mockClear();
    monitorQueueHealth.mockReset();
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    stopEmailQueueWorker();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('fires notifyError when the queue health is critical', async () => {
    monitorQueueHealth.mockResolvedValue({
      status: 'critical',
      issues: ['High failure rate: 100.0%'],
    });

    await runHealthMonitorTick();

    expect(notifyError).toHaveBeenCalledTimes(1);
    const [title, body, opts] = notifyError.mock.calls[0];
    expect(title).toMatch(/CRITICAL/i);
    expect(body).toContain('High failure rate: 100.0%');
    expect(opts).toEqual(expect.objectContaining({ priority: 5 }));
  });

  it('does NOT fire notifyError when the queue health is warning', async () => {
    monitorQueueHealth.mockResolvedValue({
      status: 'warning',
      issues: ['High queue depth: 1500 pending emails'],
    });

    await runHealthMonitorTick();

    expect(notifyError).not.toHaveBeenCalled();
  });

  it('does NOT fire notifyError when the queue health is healthy', async () => {
    monitorQueueHealth.mockResolvedValue({ status: 'healthy', issues: [] });

    await runHealthMonitorTick();

    expect(notifyError).not.toHaveBeenCalled();
  });

  it('does not throw out of the tick if monitorQueueHealth rejects', async () => {
    monitorQueueHealth.mockRejectedValue(new Error('db down'));

    await expect(runHealthMonitorTick()).resolves.not.toThrow();
    expect(notifyError).not.toHaveBeenCalled();
  });
});
