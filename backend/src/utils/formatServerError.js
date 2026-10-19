/**
 * formatServerError
 *
 * Issue #545: Shared helper to redact Sequelize (and other driver) error
 * details from HTTP responses while keeping full server-side logs.
 *
 * Returning raw `err.message` to API clients can leak SQL fragments, column
 * names, driver internals, connection strings, and stack context. The helper
 * preserves the existing non-sensitive `error` string for the client, logs
 * the full error server-side (stack included), and never surfaces `err.name`,
 * `err.stack`, or `err.original` in the response payload.
 *
 * Issue #707: Server-side logging now goes through the structured logger
 * (`backend/src/utils/logger.js`). The helper has no request context (it is
 * called from many sites), so it uses the singleton `logger` export. The
 * first argument is the context label (or fallback clientMessage); the
 * second argument is the original error, which the logger serialises via
 * its built-in Error handling (name, message, stack preserved). Non-Error
 * throwables (string, undefined) flow through the logger's else-branch and
 * still produce a structured log line. This mirrors the established pattern
 * from PR #700 (e.g., trendingCalculator, sendEmail).
 *
 * Usage:
 *   res.status(500).json(formatServerError(err, 'Failed to fetch comments'));
 *
 * Optional context label is prepended to the server-side log line so grep
 * during incident triage can scope to a route handler:
 *   res.status(500).json(
 *     formatServerError(err, 'Failed to fetch comments', '[Comments:list]')
 *   );
 */

import { logger } from "./logger.js";

/**
 * @param {unknown} err - The caught error.
 * @param {string} clientMessage - Non-sensitive message returned to the client.
 * @param {string} [logContext] - Optional prefix for the server-side log line.
 * @returns {{ error: string }} Response body safe to send to the client.
 */
export function formatServerError(err, clientMessage, logContext) {
  // Always log server-side so operators still get the full error. The logger
  // serialises Error instances (name, message, stack) into the structured
  // payload; non-Error throwables flow through Object.assign and still emit
  // a structured line.
  const prefix = logContext || clientMessage;
  logger.error(prefix, err);

  return { error: clientMessage };
}

export default formatServerError;
