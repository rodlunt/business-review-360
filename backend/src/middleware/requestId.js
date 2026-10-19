/**
 * Request ID Middleware
 * Issue #334: X-Request-ID propagation and generation
 *
 * Features:
 * - Generates unique request ID if not present
 * - Propagates X-Request-ID from Caddy/proxy
 * - Adds request ID to response headers
 * - Attaches to req object for logging
 */

import { randomUUID } from "crypto";
import { createLogger } from "../utils/logger.js";

/**
 * Request ID Middleware
 * Generates or propagates X-Request-ID header
 */
export function requestIdMiddleware(req, res, next) {
  // Get request ID from header (set by Caddy/proxy) or generate new one
  const requestId = req.headers["x-request-id"] || req.headers["x-correlation-id"] || randomUUID();

  // Attach to request object
  req.id = requestId;

  // Add to response headers for client correlation
  res.setHeader("X-Request-ID", requestId);

  // Optional: Log request with ID
  if (process.env.LOG_HTTP_REQUESTS === "true") {
    const logger = createLogger(req);
    logger.request(req);
  }

  next();
}

/**
 * Request logging middleware
 * Logs HTTP requests and responses with timing
 */
export function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const logger = createLogger(req);

  // Log request
  logger.info("HTTP Request", {
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  // Capture response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log response
    logger.info("HTTP Response", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });

    // Call original send
    return originalSend.call(this, data);
  };

  next();
}

export default {
  requestIdMiddleware,
  requestLoggingMiddleware,
};
