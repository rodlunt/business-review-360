/**
 * errorHandler ops-metrics insert tests (#848).
 *
 * Covers the ErrorEvents insert added to backend/src/middleware/errorHandler.js:
 *   - A 5xx response writes an ErrorEvents row (statusCode/route/errorName).
 *   - The insert is fire-and-forget: when it rejects, the HTTP response is
 *     unchanged (still the same 500 body) and the rejection is logged via
 *     logger.error, never thrown or left unhandled (hardening rule 9).
 *
 * See CONTROL CHECK note below the test cases: this file's first test was
 * run against a deliberately broken errorHandler.js (the ErrorEvent.create
 * call removed) to confirm it actually fails on the defect it exists to
 * catch, then re-run against the restored file to confirm it passes again.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const notifyErrorMock = jest.fn().mockResolvedValue();
jest.unstable_mockModule('../../backend/src/utils/ntfy.js', () => ({
  notifyError: notifyErrorMock,
}));

const sentryCaptureExceptionMock = jest.fn();
jest.unstable_mockModule('@sentry/node', () => ({
  captureException: sentryCaptureExceptionMock,
}));

const errorEventCreateMock = jest.fn();
jest.unstable_mockModule('../../backend/src/models/ErrorEvent.js', () => ({
  default: { create: errorEventCreateMock },
}));

const loggerErrorMock = jest.fn();
jest.unstable_mockModule('../../backend/src/utils/logger.js', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
    warn: jest.fn(),
    info: jest.fn(),
  }),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const { errorHandler } = await import('../../backend/src/middleware/errorHandler.js');

// ---------------------------------------------------------------------------
// Minimal req/res/next doubles -- errorHandler.js is a plain Express error
// middleware `(err, req, res, next)`, so a full app/supertest harness is not
// needed; a hermetic call is simpler and just as faithful.
// ---------------------------------------------------------------------------

function buildReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/ideas',
    query: {},
    get: () => undefined,
    id: 'req-1',
    ...overrides,
  };
}

function buildRes() {
  const res = {
    statusCode: null,
    body: null,
  };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

// Give any fire-and-forget promise chains inside errorHandler a tick to run
// before assertions look at their side effects.
async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('errorHandler ErrorEvents insert (#848)', () => {
  beforeEach(() => {
    notifyErrorMock.mockClear();
    sentryCaptureExceptionMock.mockClear();
    errorEventCreateMock.mockReset();
    loggerErrorMock.mockClear();
  });

  it('writes an ErrorEvents row for a 5xx response with statusCode/route/errorName', async () => {
    errorEventCreateMock.mockResolvedValue({ id: 'ee-1' });

    const err = new Error('Database exploded');
    err.name = 'SequelizeDatabaseError';
    const req = buildReq({ path: '/api/ideas', route: { path: '/ideas' } });
    const res = buildRes();

    errorHandler(err, req, res, () => {});
    await flushMicrotasks();

    expect(res.statusCode).toBe(500);
    expect(errorEventCreateMock).toHaveBeenCalledWith({
      statusCode: 500,
      route: '/ideas',
      errorName: 'SequelizeDatabaseError',
    });
  });

  it('falls back to req.path when req.route is not set', async () => {
    errorEventCreateMock.mockResolvedValue({ id: 'ee-2' });

    const err = new Error('boom');
    const req = buildReq({ path: '/api/consultants/xyz' });
    const res = buildRes();

    errorHandler(err, req, res, () => {});
    await flushMicrotasks();

    expect(errorEventCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/consultants/xyz' })
    );
  });

  it('does NOT write a row for a 4xx response (client errors are not ops-dashboard signal)', async () => {
    errorEventCreateMock.mockResolvedValue({ id: 'ee-3' });

    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, () => {});
    await flushMicrotasks();

    expect(res.statusCode).toBe(400);
    expect(errorEventCreateMock).not.toHaveBeenCalled();
  });

  it('an insert rejection does NOT change the HTTP response and is logged, not thrown', async () => {
    errorEventCreateMock.mockRejectedValue(new Error('DB connection refused'));

    const err = new Error('Database exploded');
    err.name = 'SequelizeDatabaseError';
    const req = buildReq();
    const res = buildRes();

    expect(() => errorHandler(err, req, res, () => {})).not.toThrow();
    await flushMicrotasks();

    // Response is still the normal 500 body -- unaffected by the insert failure.
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'DATABASE_ERROR' });

    // The swallowed rejection must be logged, not silently dropped
    // (hardening rule 9: a swallowed exception needs a written reason and
    // must still be loud somewhere).
    const opsMetricsLog = loggerErrorMock.mock.calls.find(
      ([msg]) => typeof msg === 'string' && msg.includes('ops-dashboard')
    );
    expect(opsMetricsLog).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CONTROL CHECK (hardening rule 13 / #848 task spec)
//
// This test suite's first test ("writes an ErrorEvents row for a 5xx
// response...") was verified to actually fail on the defect it exists to
// catch, not just pass by construction. Procedure, run manually against
// this branch:
//
//   1. Temporarily removed the `ErrorEvent.create(...).catch(...)` block
//      from backend/src/middleware/errorHandler.js (commented out).
//   2. Ran: cd backend && pnpm exec jest --config ../jest.config.js
//        errorHandlerOpsMetrics -- FAILED as expected:
//        "writes an ErrorEvents row for a 5xx response..." failed with
//        `expect(errorEventCreateMock).toHaveBeenCalledWith(...)` --
//        Number of calls: 0.
//   3. Restored the block (git diff confirmed identical to pre-break state).
//   4. Re-ran the same command -- PASSED, all 4 tests in this file green.
//
// See the task report for the captured terminal output of both runs.
// ---------------------------------------------------------------------------
