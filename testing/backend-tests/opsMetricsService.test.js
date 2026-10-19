/**
 * Ops metrics service tests (#848).
 *
 * Covers backend/src/services/opsMetricsService.js:
 *   - sampleEmailQueue() writes a MetricsSamples row with the right counts.
 *   - pruneOpsMetrics() deletes only rows older than the 90-day retention
 *     window, from both ErrorEvents and MetricsSamples.
 *
 * Mocks EmailQueue/ErrorEvent/MetricsSample model calls (same pattern as
 * emailQueueFailureBudget.test.js) so the suite stays hermetic.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const emailQueueCountMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/EmailQueue.js', () => ({
  default: { count: emailQueueCountMock },
}));

const metricsSampleCreateMock = jest.fn();
const metricsSampleDestroyMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/MetricsSample.js', () => ({
  default: {
    create: metricsSampleCreateMock,
    destroy: metricsSampleDestroyMock,
  },
}));

const errorEventDestroyMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/ErrorEvent.js', () => ({
  default: { destroy: errorEventDestroyMock },
}));

const magicLinkTokenDestroyMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/MagicLinkToken.js', () => ({
  default: { destroy: magicLinkTokenDestroyMock },
}));

const { sampleEmailQueue, pruneOpsMetrics, RETENTION_DAYS, MAGIC_LINK_PRUNE_HOURS } = await import(
  '../../backend/src/services/opsMetricsService.js'
);

describe('opsMetricsService.sampleEmailQueue', () => {
  beforeEach(() => {
    emailQueueCountMock.mockReset();
    metricsSampleCreateMock.mockReset();
  });

  it('counts pending and failed EmailQueue rows and writes one MetricsSamples row with the right counts', async () => {
    emailQueueCountMock.mockImplementation(async ({ where }) => {
      if (where.status === 'pending') return 7;
      if (where.status === 'failed') return 2;
      return 0;
    });
    metricsSampleCreateMock.mockResolvedValue({
      id: 'sample-1',
      emailQueuePending: 7,
      emailQueueFailed: 2,
    });

    const result = await sampleEmailQueue();

    expect(emailQueueCountMock).toHaveBeenCalledWith({ where: { status: 'pending' } });
    expect(emailQueueCountMock).toHaveBeenCalledWith({ where: { status: 'failed' } });
    expect(metricsSampleCreateMock).toHaveBeenCalledWith({
      emailQueuePending: 7,
      emailQueueFailed: 2,
    });
    expect(result).toEqual({ id: 'sample-1', emailQueuePending: 7, emailQueueFailed: 2 });
  });
});

describe('opsMetricsService.pruneOpsMetrics', () => {
  beforeEach(() => {
    errorEventDestroyMock.mockReset();
    metricsSampleDestroyMock.mockReset();
    magicLinkTokenDestroyMock.mockReset();
    magicLinkTokenDestroyMock.mockResolvedValue(0);
  });

  it('deletes only rows older than the retention window from both tables', async () => {
    errorEventDestroyMock.mockResolvedValue(5);
    metricsSampleDestroyMock.mockResolvedValue(12);

    const before = Date.now();
    const result = await pruneOpsMetrics();
    const after = Date.now();

    expect(RETENTION_DAYS).toBe(90);
    expect(result).toEqual({
      errorEventsDeleted: 5,
      metricsSamplesDeleted: 12,
      magicLinkTokensDeleted: 0,
      cutoff: expect.any(Date),
    });

    // Cutoff should be ~90 days before "now" at call time -- assert it falls
    // in the window bounded by the test's own before/after timestamps, so
    // this does not hardcode a specific instant.
    const expectedMs = 90 * 24 * 60 * 60 * 1000;
    expect(result.cutoff.getTime()).toBeGreaterThanOrEqual(before - expectedMs - 1000);
    expect(result.cutoff.getTime()).toBeLessThanOrEqual(after - expectedMs + 1000);

    const [errorEventArgs] = errorEventDestroyMock.mock.calls[0];
    expect(errorEventArgs.where.createdAt).toBeDefined();
    const [metricsSampleArgs] = metricsSampleDestroyMock.mock.calls[0];
    expect(metricsSampleArgs.where.sampledAt).toBeDefined();
  });

  it('returns zero counts and does not throw when nothing is old enough to prune', async () => {
    errorEventDestroyMock.mockResolvedValue(0);
    metricsSampleDestroyMock.mockResolvedValue(0);

    const result = await pruneOpsMetrics();

    expect(result.errorEventsDeleted).toBe(0);
    expect(result.metricsSamplesDeleted).toBe(0);
    expect(result.magicLinkTokensDeleted).toBe(0);
  });

  // #987: long-expired magic-link token records ride the same daily sweep.
  it('prunes MagicLinkTokens expired more than MAGIC_LINK_PRUNE_HOURS ago, keyed on expiresAt', async () => {
    errorEventDestroyMock.mockResolvedValue(0);
    metricsSampleDestroyMock.mockResolvedValue(0);
    magicLinkTokenDestroyMock.mockResolvedValue(7);

    const before = Date.now();
    const result = await pruneOpsMetrics();
    const after = Date.now();

    expect(MAGIC_LINK_PRUNE_HOURS).toBe(24);
    expect(result.magicLinkTokensDeleted).toBe(7);

    // The delete must key on expiresAt (so unredeemed tokens age out the
    // same as consumed ones) with a cutoff ~24h before "now" at call time.
    const [args] = magicLinkTokenDestroyMock.mock.calls[0];
    expect(args.where.expiresAt).toBeDefined();
    expect(args.where.consumedAt).toBeUndefined();
    // Op.lt is a Symbol key, so Object.values() cannot see it.
    const [opSymbol] = Object.getOwnPropertySymbols(args.where.expiresAt);
    const cutoffMs = args.where.expiresAt[opSymbol].getTime();
    const expectedMs = 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(before - expectedMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - expectedMs + 1000);
  });
});
