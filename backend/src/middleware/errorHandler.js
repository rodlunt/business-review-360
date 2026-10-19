/**
 * Centralized Error Handler Middleware
 * Issue #335: Centralized error handling with logging
 *
 * Features:
 * - Catches all unhandled errors
 * - Logs errors with context (request ID, user, tenant)
 * - Returns consistent error responses
 * - Handles different error types (validation, auth, database, etc.)
 * - Production-safe error messages (no stack traces to client)
 */

import { createLogger } from "../utils/logger.js";
import { notifyError } from "../utils/ntfy.js";
import * as Sentry from "@sentry/node";
import ErrorEvent from "../models/ErrorEvent.js";

/**
 * HTTP Error class for known errors
 */
export class HttpError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Error handler middleware
 * Must be registered LAST in middleware chain
 */
export function errorHandler(err, req, res, _next) {
  const logger = createLogger(req);

  // Default to 500 Internal Server Error
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let code = err.code || "INTERNAL_ERROR";
  let details = err.details || null;

  // Handle specific error types
  if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Validation failed";
    details = err.errors || err.message;
  } else if (err.name === "UnauthorizedError" || err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = "UNAUTHORIZED";
    message = "Authentication required";
  } else if (err.name === "ForbiddenError") {
    statusCode = 403;
    code = "FORBIDDEN";
    message = "Access denied";
  } else if (err.name === "SequelizeValidationError") {
    statusCode = 400;
    code = "DATABASE_VALIDATION_ERROR";
    message = "Database validation failed";
    details = err.errors?.map((e) => ({
      field: e.path,
      message: e.message,
    }));
  } else if (err.name === "SequelizeUniqueConstraintError") {
    statusCode = 409;
    code = "DUPLICATE_ENTRY";
    message = "Resource already exists";
    details = err.errors?.map((e) => ({
      field: e.path,
      message: e.message,
    }));
  } else if (err.name === "SequelizeForeignKeyConstraintError") {
    statusCode = 400;
    code = "FOREIGN_KEY_VIOLATION";
    message = "Invalid reference to related resource";
  } else if (err.name === "SequelizeDatabaseError") {
    statusCode = 500;
    code = "DATABASE_ERROR";
    message = "Database operation failed";
    // Don't expose database details to client
  } else if (err.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    code = "FILE_TOO_LARGE";
    message = "File size exceeds limit";
  } else if (err.code === "EBADCSRFTOKEN") {
    statusCode = 403;
    code = "INVALID_CSRF_TOKEN";
    message = "Invalid CSRF token";
  }

  // Log error with context
  logger.error("Error occurred", {
    error: err,
    statusCode,
    code,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body ? sanitizeBody(req.body) : undefined,
    userAgent: req.get("user-agent"),
  });

  // Alert on server errors only (4xx are client mistakes, not bugs).
  if (statusCode >= 500) {
    Sentry.captureException(err, {
      tags: { code, component: "backend" },
      extra: { method: req.method, path: req.path, requestId: req.id },
    });
    const ntfyTitle = `[BR360] ${code}: ${req.method} ${req.path}`;
    const ntfyBody = `${message}\n\n${err.stack ? err.stack.slice(0, 800) : "(no stack)"}`;
    notifyError(ntfyTitle, ntfyBody).catch(() => {});

    // #848: minimal ops-dashboard error-rate feed. No message/stack/PII here
    // (that stays in Sentry above) -- just enough to count 5xx-per-hour. A
    // metrics insert failure must never break error handling itself
    // (hardening rule 9), so this is deliberately fire-and-forget with a
    // logged, swallowed rejection rather than awaited inline.
    ErrorEvent.create({
      statusCode,
      // Truncate to the column width: an unmatched long path would otherwise
      // make the insert itself fail, leaving exactly those errors uncounted.
      route: (req.route?.path || req.path || "").slice(0, 255),
      errorName: err.name,
    }).catch((insertErr) => {
      logger.error("[ErrorEvent] Failed to record ops-dashboard error event", {
        message: insertErr.message,
      });
    });
  }

  // Build error response
  const errorResponse = {
    error: message,
    code,
  };

  // Add details in development or for client errors
  if (details && (process.env.NODE_ENV === "development" || statusCode < 500)) {
    errorResponse.details = details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === "development" && err.stack) {
    errorResponse.stack = err.stack;
  }

  // Add request ID for tracing
  if (req.id) {
    errorResponse.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Sanitize request body for logging (remove sensitive fields)
 */
function sanitizeBody(body) {
  const sensitiveFields = ["password", "token", "secret", "apiKey", "creditCard"];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

/**
 * 404 Not Found handler
 * Catches all undefined routes
 */
export function notFoundHandler(req, res, next) {
  const error = new HttpError(404, `Cannot ${req.method} ${req.path}`, "NOT_FOUND");
  next(error);
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch promise rejections
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 *   }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Process-level error handlers
 * Handles uncaught exceptions and unhandled rejections.
 *
 * Deliberate dual emission (logger.* + console.*): the process is about
 * to call process.exit(1), and structured-logger transports buffer
 * asynchronously. console.error/log writes synchronously to stderr/stdout
 * so the signal lands even if the logger has not flushed, or if the
 * logger itself is what threw. This is the only documented exception to
 * the project-wide logger-only rule (#496); see CLAUDE.md Conventions.
 */
export function setupProcessErrorHandlers() {
  const logger = createLogger();

  // Uncaught exceptions
  process.on("uncaughtException", async (error) => {
    logger.error("Uncaught Exception", { error });
    Sentry.captureException(error);
    /* eslint-disable no-console */
    console.error("UNCAUGHT EXCEPTION! Shutting down...");
    console.error(error);
    /* eslint-enable no-console */
    await notifyError(
      "[BR360] Uncaught Exception",
      `${error.message}\n\n${error.stack?.slice(0, 800) ?? "(no stack)"}`,
      { priority: 5, urgent: true }
    );
    await Sentry.flush(2000).catch(() => {});
    process.exit(1);
  });

  // Unhandled promise rejections
  process.on("unhandledRejection", async (reason, promise) => {
    logger.error("Unhandled Rejection", {
      reason,
      promise: promise.toString(),
    });
    Sentry.captureException(reason);
    /* eslint-disable no-console */
    console.error("UNHANDLED REJECTION! Shutting down...");
    console.error(reason);
    /* eslint-enable no-console */
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack?.slice(0, 800) : String(reason);
    await notifyError("[BR360] Unhandled Rejection", `${msg}\n\n${stack ?? "(no stack)"}`, {
      priority: 5,
      urgent: true,
    });
    await Sentry.flush(2000).catch(() => {});
    process.exit(1);
  });

  // SIGTERM signal (graceful shutdown)
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Starting graceful shutdown...");
    console.log("SIGTERM received. Shutting down gracefully..."); // eslint-disable-line no-console
    process.exit(0);
  });

  // SIGINT signal (Ctrl+C)
  process.on("SIGINT", () => {
    logger.info("SIGINT received. Starting graceful shutdown...");
    console.log("\nSIGINT received. Shutting down gracefully..."); // eslint-disable-line no-console
    process.exit(0);
  });
}

export default {
  HttpError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  setupProcessErrorHandlers,
};
