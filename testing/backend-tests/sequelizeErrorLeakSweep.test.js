/**
 * Issue #545: Sequelize error-leak sweep
 *
 * Unit test for the shared formatServerError helper that backs the sweep
 * across 28 route-handler sites. Route-level supertest coverage needs
 * DATABASE_URL + tenant resolver middleware, which is hostile inside the
 * worktree; per ticket guidance, we test the helper directly and rely on
 * grep-based verification (captured in the commit message) to prove every
 * call site now routes through it.
 *
 * What we assert:
 *   1. The helper returns the expected client payload shape - only `error`.
 *   2. It never leaks Sequelize / SQL / driver substrings in the body.
 *   3. It never includes err.name, err.stack, or err.original in the body.
 *   4. It still logs the full error server-side via the structured logger.
 *
 * Issue #707: spy retargeted from `console.error` to `logger.error` after
 * formatServerError migrated to the structured logger. The security
 * guarantee (full error logged server-side, body leak-free) is unchanged;
 * only the observability channel moved.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { formatServerError } from '../../backend/src/utils/formatServerError.js';
import { logger } from '../../backend/src/utils/logger.js';

describe('formatServerError (Issue #545 Sequelize error-leak sweep)', () => {
  let loggerErrorSpy;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  // Realistic Sequelize-style error surface that previously leaked via
  // `details: err.message` in multiple route handlers.
  function makeSequelizeError() {
    const err = new Error(
      'SequelizeDatabaseError: column "secret_column" does not exist in SELECT * FROM users WHERE organization_id = $1'
    );
    err.name = 'SequelizeDatabaseError';
    err.original = {
      code: '42703',
      routine: 'errorMissingColumn',
      internalQuery: 'INSERT INTO audit_log (user_id, tenant_id) VALUES (...)',
    };
    err.sql = 'SELECT * FROM users WHERE organization_id = $1';
    return err;
  }

  it('returns only a non-sensitive error string to the client', () => {
    const err = makeSequelizeError();
    const body = formatServerError(err, 'Failed to vote');

    expect(body).toEqual({ error: 'Failed to vote' });
    expect(Object.keys(body)).toEqual(['error']);
  });

  it('does not leak Sequelize / SQL / driver substrings in the response body', () => {
    const err = makeSequelizeError();
    const body = formatServerError(err, 'Failed to fetch notification preferences');
    const serialised = JSON.stringify(body);

    // Case-insensitive to catch any casing drift in real driver messages.
    const forbidden = [
      /sequelize/i,
      /SELECT\s/i,
      /INSERT\s/i,
      /UPDATE\s/i,
      /DELETE\s/i,
      /column/i,
      /secret_column/i,
      /organization_id/i,
      /\$1/, // pg-style bind placeholder
      /errorMissingColumn/i,
    ];

    for (const pattern of forbidden) {
      expect(serialised).not.toMatch(pattern);
    }
  });

  it('does not include err.message, err.name, err.stack, or err.original', () => {
    const err = makeSequelizeError();
    err.stack = 'Error: boom\n    at /var/app/backend/src/routes/votes.js:26';

    const body = formatServerError(err, 'Failed to calculate ROI');
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain(err.message);
    expect(serialised).not.toContain(err.name);
    expect(serialised).not.toContain(err.stack);
    expect(serialised).not.toContain('internalQuery');
    expect(body).not.toHaveProperty('details');
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('name');
    expect(body).not.toHaveProperty('original');
  });

  it('still logs the full error server-side via the structured logger', () => {
    const err = makeSequelizeError();
    formatServerError(err, 'Failed to vote', '[Votes:upvote]');

    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    const [prefix, loggedErr] = loggerErrorSpy.mock.calls[0];
    expect(prefix).toBe('[Votes:upvote]');
    // The full error object (with all fields) reaches the server log. Identity
    // is preserved because formatServerError forwards the bare error reference
    // to the logger; the logger's Error-instance branch then serialises name,
    // message, and stack into the structured payload.
    expect(loggedErr).toBe(err);
  });

  it('falls back to clientMessage as log prefix when no context supplied', () => {
    const err = new Error('boom');
    formatServerError(err, 'Failed to remove vote');

    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to remove vote', err);
  });

  it('is safe against non-Error throwables (string, undefined)', () => {
    const body1 = formatServerError('something exploded', 'Failed to vote');
    expect(body1).toEqual({ error: 'Failed to vote' });

    const body2 = formatServerError(undefined, 'Login failed');
    expect(body2).toEqual({ error: 'Login failed' });
  });

  // Representative coverage across the three files #499 did not touch, so
  // the sweep is visible at the response-shape level even without running
  // supertest. These are pure shape assertions on the helper output for
  // the exact clientMessage strings now used at those call sites.
  it.each([
    ['votes.js / upvote', 'Failed to vote'],
    ['votes.js / remove', 'Failed to remove vote'],
    ['notifications.js / preferences GET', 'Failed to fetch notification preferences'],
    ['notifications.js / subscribe', 'Failed to subscribe to idea'],
    ['analytics.js / ROI', 'Failed to calculate ROI'],
  ])('site "%s" produces a leak-free body', (_label, clientMessage) => {
    const err = makeSequelizeError();
    const body = formatServerError(err, clientMessage);

    expect(body).toEqual({ error: clientMessage });
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/sequelize/i);
    expect(serialised).not.toMatch(/SELECT/i);
    expect(serialised).not.toMatch(/INSERT/i);
    expect(serialised).not.toMatch(/column/i);
    expect(serialised).not.toContain(err.message);
  });
});
