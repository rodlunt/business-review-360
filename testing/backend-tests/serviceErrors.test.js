/**
 * Issue #485, Phase 1 foundation.
 *
 * Tests for `backend/src/services/errors.js`:
 *   - typed-error constructors set the right `code`, `statusCode`, and `name`
 *   - `respondToServiceError` maps each subclass to the right HTTP status
 *   - the unknown-error path falls through to `formatServerError` with a 500
 *
 * No HTTP scaffolding. We assert on a fake `res` object that mirrors the
 * Express response API just enough to record `status()` and `json()` calls.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ServiceError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  PlanLimitError,
  respondToServiceError,
} from '../../backend/src/services/errors.js';
import { logger } from '../../backend/src/utils/logger.js';

function makeFakeRes() {
  const res = {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('Issue #485 Phase 1, ServiceError class hierarchy', () => {
  it('ServiceError defaults to code SERVICE_ERROR and status 500', () => {
    const err = new ServiceError('something broke');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('SERVICE_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('ServiceError');
  });

  it('ServiceError accepts an explicit code, statusCode, and details', () => {
    const err = new ServiceError('bespoke', { code: 'CUSTOM', statusCode: 418, details: { teapot: true } });

    expect(err.code).toBe('CUSTOM');
    expect(err.statusCode).toBe(418);
    expect(err.details).toEqual({ teapot: true });
  });

  it('NotFoundError defaults to code NOT_FOUND and status 404', () => {
    const err = new NotFoundError('idea not found');

    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('NotFoundError');
  });

  it('NotFoundError accepts a domain-specific code override', () => {
    const err = new NotFoundError('idea not found', { code: 'IDEA_NOT_FOUND' });

    expect(err.code).toBe('IDEA_NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('ForbiddenError defaults to code FORBIDDEN and status 403', () => {
    const err = new ForbiddenError('cross-tenant access denied');

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe('ForbiddenError');
  });

  it('ValidationError defaults to code VALIDATION_ERROR and status 400', () => {
    const err = new ValidationError('title required');

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ValidationError');
  });

  it('ConflictError defaults to code CONFLICT and status 409', () => {
    const err = new ConflictError('duplicate');

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('CONFLICT');
    expect(err.statusCode).toBe(409);
    expect(err.name).toBe('ConflictError');
  });

  it('PlanLimitError defaults to code PLAN_LIMIT_EXCEEDED and status 402', () => {
    const err = new PlanLimitError('seat limit hit');

    expect(err).toBeInstanceOf(ServiceError);
    expect(err.code).toBe('PLAN_LIMIT_EXCEEDED');
    expect(err.statusCode).toBe(402);
    expect(err.name).toBe('PlanLimitError');
  });

  it('subclasses propagate optional details onto the instance', () => {
    const err = new ValidationError('bad input', { code: 'IDEA_TITLE_BLANK', details: { field: 'title' } });

    expect(err.code).toBe('IDEA_TITLE_BLANK');
    expect(err.details).toEqual({ field: 'title' });
  });

  it('omits details when not supplied (no undefined property)', () => {
    const err = new NotFoundError('missing');

    expect(Object.prototype.hasOwnProperty.call(err, 'details')).toBe(false);
  });
});

describe('Issue #485 Phase 1, respondToServiceError HTTP mapping', () => {
  let loggerSpy;

  beforeEach(() => {
    // formatServerError logs through the structured logger on the 500 path
    // (Issue #707 migration). Silence it and assert on it where relevant.
    loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  it('maps NotFoundError to 404 with error + code envelope', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new NotFoundError('Idea not found', { code: 'IDEA_NOT_FOUND' }));

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Idea not found', code: 'IDEA_NOT_FOUND' });
  });

  it('maps ForbiddenError to 403', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new ForbiddenError('Access denied'));

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Access denied', code: 'FORBIDDEN' });
  });

  it('maps ValidationError to 400', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new ValidationError('Title required'));

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Title required', code: 'VALIDATION_ERROR' });
  });

  it('maps ConflictError to 409', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new ConflictError('Already exists'));

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Already exists', code: 'CONFLICT' });
  });

  it('maps PlanLimitError to 402', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new PlanLimitError('Seat limit reached', { code: 'SEAT_LIMIT' }));

    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'Seat limit reached', code: 'SEAT_LIMIT' });
  });

  it('maps a bare ServiceError using its own statusCode', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new ServiceError('teapot', { statusCode: 418, code: 'TEAPOT' }));

    expect(res.statusCode).toBe(418);
    expect(res.body).toEqual({ error: 'teapot', code: 'TEAPOT' });
  });

  it('includes details on the response body when set', () => {
    const res = makeFakeRes();
    respondToServiceError(
      res,
      new ValidationError('Bad input', { code: 'IDEA_TITLE_BLANK', details: { field: 'title' } })
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Bad input',
      code: 'IDEA_TITLE_BLANK',
      details: { field: 'title' },
    });
  });

  it('falls through to 500 with formatServerError envelope on unknown errors', () => {
    const res = makeFakeRes();
    const unknown = new Error('boom');
    respondToServiceError(res, unknown, {
      fallbackMessage: 'Failed to create idea',
      logContext: '[Ideas:create]',
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to create idea' });
    // formatServerError logs server-side via the structured logger; verify it
    // was invoked with our context label (Issue #707 migration).
    expect(loggerSpy).toHaveBeenCalled();
    const [firstArg] = loggerSpy.mock.calls[0];
    expect(firstArg).toBe('[Ideas:create]');
  });

  it('uses a generic fallback message when none is provided', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new Error('boom'));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('does not log via the structured logger on the typed-error path', () => {
    const res = makeFakeRes();
    respondToServiceError(res, new NotFoundError('nope'));

    // Typed errors are domain signals, not unexpected failures. The route
    // adapter should not spam server logs every time a 404 fires.
    expect(loggerSpy).not.toHaveBeenCalled();
  });

  it('returns the fake res to support chaining', () => {
    const res = makeFakeRes();
    const result = respondToServiceError(res, new NotFoundError('nope'));

    expect(result).toBe(res);
  });

  it('treats non-Error throws as unknown and 500s safely', () => {
    const res = makeFakeRes();
    respondToServiceError(res, 'a string was thrown', { fallbackMessage: 'Failed' });

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed' });
  });
});
