/**
 * Structured Logger Utility
 * Issue #334: JSON logging with X-Request-ID support
 *
 * Provides structured JSON logging with:
 * - Request ID correlation
 * - Timestamp
 * - Log levels (info, warn, error, debug)
 * - Consistent formatting
 * - Production-ready output
 */

/* eslint-disable no-console */
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Get log level from environment or default to INFO
const currentLogLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()]
  : LOG_LEVELS.INFO;

/**
 * Format log entry as JSON
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Additional metadata
 * @param {string} requestId - Optional request ID
 * @returns {string} JSON formatted log entry
 */
function formatLog(level, message, meta = {}, requestId = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  // Add request ID if available
  if (requestId) {
    logEntry.requestId = requestId;
  }

  // Add environment
  if (process.env.NODE_ENV) {
    logEntry.environment = process.env.NODE_ENV;
  }

  // In development, pretty print; in production, single line
  if (process.env.NODE_ENV === "development") {
    return JSON.stringify(logEntry, null, 2);
  }

  return JSON.stringify(logEntry);
}

/**
 * Core logging function
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Additional metadata
 * @param {string} requestId - Optional request ID
 */
function log(level, message, meta = {}, requestId = null) {
  const levelValue = LOG_LEVELS[level];

  // Skip if below current log level
  if (levelValue < currentLogLevel) {
    return;
  }

  const formattedLog = formatLog(level, message, meta, requestId);

  // Use appropriate console method
  switch (level) {
    case "ERROR":
      console.error(formattedLog);
      break;
    case "WARN":
      console.warn(formattedLog);
      break;
    case "DEBUG":
      console.debug(formattedLog);
      break;
    default:
      console.log(formattedLog);
  }
}

/**
 * Create logger instance with optional request context
 * @param {object} req - Express request object (optional)
 * @returns {object} Logger instance with methods
 */
function createLogger(req = null) {
  const requestId = req?.id || req?.headers?.["x-request-id"] || null;
  const tenantId = req?.tenant?.id || null;
  const userId = req?.user?.id || null;

  // Build context metadata
  const context = {};
  if (tenantId) context.tenantId = tenantId;
  if (userId) context.userId = userId;

  return {
    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {object} meta - Additional metadata
     */
    debug(message, meta = {}) {
      log("DEBUG", message, { ...context, ...meta }, requestId);
    },

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {object} meta - Additional metadata
     */
    info(message, meta = {}) {
      log("INFO", message, { ...context, ...meta }, requestId);
    },

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {object} meta - Additional metadata
     */
    warn(message, meta = {}) {
      log("WARN", message, { ...context, ...meta }, requestId);
    },

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Error|object} error - Error object or metadata
     */
    error(message, error = {}) {
      const meta = { ...context };

      // Handle Error objects
      if (error instanceof Error) {
        meta.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        Object.assign(meta, error);
      }

      log("ERROR", message, meta, requestId);
    },

    /**
     * Log HTTP request
     * @param {object} req - Express request object
     */
    request(req) {
      this.info("HTTP Request", {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    },

    /**
     * Log HTTP response
     * @param {object} req - Express request object
     * @param {object} res - Express response object
     * @param {number} duration - Request duration in ms
     */
    response(req, res, duration) {
      this.info("HTTP Response", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    },
  };
}

// Export singleton logger for non-request contexts
const logger = createLogger();

export { logger, createLogger, LOG_LEVELS };
