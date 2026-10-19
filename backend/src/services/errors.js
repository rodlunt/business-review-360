/**
 * Service-layer typed errors and HTTP adapter helper.
 *
 * Issue #485, Phase 1 foundation. Spec:
 *   docs/superpowers/specs/2026-04-29-485-domain-service-layer-design.md
 *
 * Why typed errors?
 *
 * Services in `backend/src/services/` are HTTP-agnostic by design (D2 in the
 * spec): they take a plain `ctx` object plus a typed payload, and return plain
 * data. They are imported from cron jobs and unit tests in addition to Express
 * routes, so they cannot throw HTTP-shaped errors. The route handler is the
 * only layer that knows about `res`, status codes, and JSON envelopes.
 *
 * Each typed error carries a stable `code` string. The route adapter maps the
 * class to an HTTP status. Non-HTTP callers (cron jobs, scripts) can branch on
 * `err.code` directly without depending on Express semantics. The error
 * messages themselves are safe to return to clients (no SQL fragments, no
 * stack traces, no driver internals) because the service author writes them.
 *
 * For genuinely unexpected errors (anything that is not a `ServiceError`),
 * the helper falls through to `formatServerError` which emits a 500 with a
 * redacted client message and a full server-side log line. That preserves the
 * existing safety net introduced in #545.
 */

import { formatServerError } from "../utils/formatServerError.js";

/**
 * Base class for all service-layer errors. Every subclass sets a stable
 * `code` string and a sensible default HTTP status. Callers should throw the
 * specific subclass; only catch `ServiceError` itself when a generic check is
 * genuinely intended (eg the route adapter).
 */
export class ServiceError extends Error {
  /**
   * @param {string} message Client-safe message.
   * @param {object} [options]
   * @param {string} [options.code] Stable machine-readable code.
   * @param {number} [options.statusCode] HTTP status the route adapter should
   *   use. Subclasses set sensible defaults; override only when a specific
   *   call site demands it (rare).
   * @param {object} [options.details] Optional structured detail payload
   *   appended to the JSON response under the `details` key. Must be safe to
   *   return to the client; the service author owns that contract.
   */
  constructor(message, { code = "SERVICE_ERROR", statusCode = 500, details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Resource not found. Maps to HTTP 404.
 */
export class NotFoundError extends ServiceError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]
   * @param {object} [options.details]
   */
  constructor(message, { code = "NOT_FOUND", details } = {}) {
    super(message, { code, statusCode: 404, details });
  }
}

/**
 * Authenticated user is not allowed to perform this action (eg cross-tenant
 * access, IDOR guard, admin-only operation). Maps to HTTP 403.
 */
export class ForbiddenError extends ServiceError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]
   * @param {object} [options.details]
   */
  constructor(message, { code = "FORBIDDEN", details } = {}) {
    super(message, { code, statusCode: 403, details });
  }
}

/**
 * Input failed business or schema validation. Maps to HTTP 400.
 *
 * This covers validation that the service layer enforces on its own (eg
 * "title cannot be blank", "status must be one of <set>"). Express-validator
 * results that the route layer surfaces stay at the route boundary; they do
 * not need to come through this class.
 */
export class ValidationError extends ServiceError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]
   * @param {object} [options.details]
   */
  constructor(message, { code = "VALIDATION_ERROR", details } = {}) {
    super(message, { code, statusCode: 400, details });
  }
}

/**
 * Operation conflicts with current state (eg duplicate resource, state
 * transition not allowed). Maps to HTTP 409.
 */
export class ConflictError extends ServiceError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]
   * @param {object} [options.details]
   */
  constructor(message, { code = "CONFLICT", details } = {}) {
    super(message, { code, statusCode: 409, details });
  }
}

/**
 * Action blocked by the tenant's plan limits (seat cap, feature gate, etc).
 * Maps to HTTP 402 (Payment Required) so the frontend can branch on the
 * status code alone for upgrade prompts. The `code` string carries the
 * specific limit hit.
 */
export class PlanLimitError extends ServiceError {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]
   * @param {object} [options.details]
   */
  constructor(message, { code = "PLAN_LIMIT_EXCEEDED", details } = {}) {
    super(message, { code, statusCode: 402, details });
  }
}

/**
 * Translate a thrown error into an HTTP response.
 *
 * Route adapters call this from their catch block. Known `ServiceError`
 * subclasses use their own `statusCode` and a `{ error, code, details? }`
 * envelope. Anything else falls through to `formatServerError`, which logs
 * the full error server-side and returns a redacted 500 envelope to the
 * client (the existing #545 contract).
 *
 * The `logContext` argument mirrors `formatServerError`: a short label that
 * scopes server-side log lines for incident triage (eg `'[Ideas:create]'`).
 *
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {object} [options]
 * @param {string} [options.fallbackMessage] Client-safe message for the 500
 *   path. Required in practice; defaults to a generic string only as a
 *   last-resort safety net.
 * @param {string} [options.logContext] Optional grep-friendly prefix for the
 *   server-side log line on the 500 path.
 * @returns {import('express').Response}
 */
export function respondToServiceError(
  res,
  err,
  { fallbackMessage = "Internal server error", logContext } = {}
) {
  if (err instanceof ServiceError) {
    const body = { error: err.message, code: err.code };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    return res.status(err.statusCode).json(body);
  }

  return res.status(500).json(formatServerError(err, fallbackMessage, logContext));
}

export default {
  ServiceError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  PlanLimitError,
  respondToServiceError,
};
