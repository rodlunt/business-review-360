// Security middleware and validation utilities
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { body, param, query, validationResult } from "express-validator";
import { logger, createLogger } from "../utils/logger.js";

// Enhanced security headers
export const securityHeaders = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });
};

// Input sanitization middleware
export const sanitizeInput = (req, res, next) => {
  // Skip sanitization for Stripe webhook (needs raw body)
  // req.path is relative to the router mount point
  if (
    req.path === "/webhook" ||
    req.originalUrl === "/api/billing/webhook" ||
    req.url.includes("/billing/webhook")
  ) {
    return next();
  }

  const sanitizeString = (str) => {
    if (typeof str !== "string") return str;

    // Remove potential XSS patterns
    let cleaned = str;

    // Remove script tags (simple and effective approach)
    cleaned = cleaned.replace(/<script[^>]*>.*?<\/script>/gis, "");
    cleaned = cleaned.replace(/<script[^>]*>/gi, "");
    cleaned = cleaned.replace(/<\/script>/gi, "");

    // Remove other dangerous tags
    cleaned = cleaned.replace(/<iframe[^>]*>.*?<\/iframe>/gis, "");
    cleaned = cleaned.replace(/<object[^>]*>.*?<\/object>/gis, "");
    cleaned = cleaned.replace(/<embed[^>]*>/gi, "");

    // Remove event handlers
    cleaned = cleaned.replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
    cleaned = cleaned.replace(/on\w+\s*=\s*[^\s>]*/gi, "");

    // Remove javascript: protocol
    cleaned = cleaned.replace(/javascript:/gi, "");
    cleaned = cleaned.replace(/data:text\/html/gi, "");

    return cleaned.trim();
  };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === "string") {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) {
    sanitizeObject(req.body);
  }
  if (req.query) {
    sanitizeObject(req.query);
  }
  if (req.params) {
    sanitizeObject(req.params);
  }

  next();
};

// Validation error handler
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
        value: err.value,
      })),
    });
  }
  next();
};

// Common validation rules
export const validationRules = {
  // User validation
  username: body("username")
    .isLength({ min: 3, max: 50 })
    .withMessage("Username must be between 3 and 50 characters")
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Username can only contain letters, numbers, hyphens, and underscores"),

  password: body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage(
      "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character"
    ),

  email: body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail(),

  // Idea validation
  ideaTitle: body("title")
    .isLength({ min: 5, max: 200 })
    .withMessage("Title must be between 5 and 200 characters"),

  ideaDescription: body("description")
    .isLength({ min: 10, max: 5000 })
    .withMessage("Description must be between 10 and 5000 characters"),

  category: body("category")
    .optional()
    .isLength({ max: 50 })
    .withMessage("Category cannot exceed 50 characters"),

  status: body("status")
    .optional()
    .isIn([
      "Reviewing",
      "Approved",
      "In Progress",
      "Completed",
      "Rejected",
      "Complete",
      "Duplicate",
      "Hidden",
      "Open",
    ])
    .withMessage("Invalid status value"),

  // Comment validation
  commentContent: body("content")
    .isLength({ min: 1, max: 2000 })
    .withMessage("Comment must be between 1 and 2000 characters"),

  // UUID validation
  uuid: param("id").isUUID(4).withMessage("Invalid ID format"),

  // Pagination validation
  page: query("page")
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage("Page must be a positive integer"),

  limit: query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  // Search validation
  search: query("search")
    .optional()
    .isLength({ max: 100 })
    .withMessage("Search query cannot exceed 100 characters"),

  // Sort validation
  sort: query("sort")
    .optional()
    .isIn(["newest", "oldest", "trending", "popular"])
    .withMessage("Invalid sort option"),
};

// Rate limiting configurations
const disableRate =
  process.env.DISABLE_RATE_LIMIT === "true" || process.env.DISABLE_RATE_LIMIT === "1";

// Server-determined rate-limit bucket key.
// Never reads from attacker-controlled surfaces (req.query, req.body,
// req.headers). Uses the authenticated user id when populated, otherwise
// falls back to req.ip (Express resolves this against `trust proxy` so
// X-Forwarded-For is handled safely upstream).
// Closes #482.
export const buildRateLimitKey = (req) => {
  const userId = req?.user?.id;
  if (userId !== undefined && userId !== null && userId !== "") {
    return String(userId);
  }
  return req?.ip || "unknown";
};

// Phase 5 (5a, #858): bucket key for the org-less login path.
//
// This DELIBERATELY keys off req.body.email, which buildRateLimitKey
// avoids on purpose (#482: an attacker-controlled key lets the attacker
// rotate it to evade a limiter meant to bucket THEM). #482's concern does
// not apply here: this limiter protects a specific victim ACCOUNT from
// password guessing / credential stuffing, where the attacker necessarily
// sends the victim's email. The org-less path has no req.user and no
// organizationId, so email is the only account-scoped key available; the
// existing IP-keyed rateLimiters.auth still covers spray across accounts.
// Email is normalised to the same form the lookup uses
// (trim().toLowerCase()) so case/whitespace variants cannot evade. Falls
// back to req.ip when email is absent (the org-scoped path, where this
// limiter is a no-op via the index.js wrapper anyway).
export const buildEmailLoginKey = (req) => {
  const email = req?.body?.email;
  if (typeof email === "string" && email.trim() !== "") {
    return `email:${email.trim().toLowerCase()}`;
  }
  return req?.ip || "unknown";
};

export const rateLimiters = {
  // Strict rate limiting for sensitive operations (auth)
  auth: disableRate
    ? (req, res, next) => next()
    : process.env.NODE_ENV === "production"
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 20,
          message: {
            error: "Too many authentication attempts. Please try again later.",
          },
          standardHeaders: true,
          legacyHeaders: false,
          keyGenerator: buildRateLimitKey,
        })
      : (req, res, next) => next(),

  // Password reset rate limiting (keep enabled)
  passwordReset: disableRate
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        limit: 3,
        message: {
          error: "Too many password reset attempts. Please try again later.",
        },
        standardHeaders: true,
        legacyHeaders: false,
      }),

  // General API rate limiting
  api: disableRate
    ? (req, res, next) => next()
    : process.env.NODE_ENV === "production"
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 500,
          message: { error: "Too many requests. Please try again later." },
          standardHeaders: true,
          legacyHeaders: false,
          keyGenerator: buildRateLimitKey,
          handler: (req, res) => {
            const key = buildRateLimitKey(req);
            createLogger(req).warn("Rate limit exceeded (api)", {
              url: req.originalUrl,
              method: req.method,
              key,
              ip: req.ip,
              userId: req.user?.id,
            });
            res.status(429).json({ error: "Too many requests. Please try again later." });
          },
        })
      : (req, res, next) => next(),

  // Ideas endpoint rate limiting
  ideas: disableRate
    ? (req, res, next) => next()
    : process.env.NODE_ENV === "production"
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 200,
          message: { error: "Too many idea requests. Please try again later." },
          standardHeaders: true,
          legacyHeaders: false,
          keyGenerator: buildRateLimitKey,
          handler: (req, res) => {
            const key = buildRateLimitKey(req);
            createLogger(req).warn("Rate limit exceeded (ideas)", {
              url: req.originalUrl,
              method: req.method,
              key,
              ip: req.ip,
              userId: req.user?.id,
            });
            res.status(429).json({ error: "Too many idea requests. Please try again later." });
          },
        })
      : (req, res, next) => next(),

  // File upload rate limiting
  upload: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 10,
    message: { error: "Too many file uploads. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  }),

  // Phase 5 (5a, #858): per-email limiter for the org-less login path.
  // Same enable/disable guards as `auth` (DISABLE_RATE_LIMIT and
  // production-only) so test/dev suites stay hermetic without extra
  // config. Tighter than the IP limiter because it targets a single
  // account: 10 attempts / 15 min. Stacks WITH rateLimiters.auth (IP),
  // it does not replace it. 429 body matches the generic auth message so
  // a locked-out probe cannot distinguish it from other auth failures.
  emailLogin: disableRate
    ? (req, res, next) => next()
    : process.env.NODE_ENV === "production"
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: 10,
          message: {
            error: "Too many authentication attempts. Please try again later.",
          },
          standardHeaders: true,
          legacyHeaders: false,
          keyGenerator: buildEmailLoginKey,
          handler: (req, res) => {
            createLogger(req).warn("Rate limit exceeded (emailLogin)", {
              url: req.originalUrl,
              method: req.method,
              key: buildEmailLoginKey(req),
              ip: req.ip,
            });
            res.status(429).json({
              error: "Too many authentication attempts. Please try again later.",
            });
          },
        })
      : (req, res, next) => next(),
};

// Content Security Policy for uploaded files.
//
// SECURITY NOTE: `req.file.mimetype` is populated by multer from the
// multipart Content-Type header, which the client controls. Relying on it
// for access control allowed an attacker to upload an SVG carrying
// `<script>` (or a PHP webshell) while claiming `Content-Type: image/jpeg`.
// Enforcement now happens via magic-byte sniffing in
// `validateFileMagicBytes.js`. This wrapper delegates to that middleware
// so any existing caller of `fileSecurityCheck` inherits the hardened
// behaviour, then applies the existing size cap.
import { validateFileMagicBytes } from "./validateFileMagicBytes.js";

export const fileSecurityCheck = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  // Enforce size cap first so we do not waste a disk read on an oversized
  // payload we will reject anyway.
  if (req.file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "File too large. Maximum size is 5MB." });
  }

  return validateFileMagicBytes({ required: false })(req, res, next);
};

// IP range validation utility
function parseIPRange(cidr) {
  if (!cidr || typeof cidr !== "string") return null;

  try {
    // Handle IPv4 CIDR notation
    if (cidr.includes(".")) {
      const [ip, prefixStr] = cidr.includes("/") ? cidr.split("/") : [cidr, "32"];
      const prefix = parseInt(prefixStr, 10);

      if (prefix < 0 || prefix > 32) return null;

      const ipParts = ip.split(".").map((part) => parseInt(part, 10));
      if (ipParts.length !== 4 || ipParts.some((part) => part < 0 || part > 255)) return null;

      const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
      const mask = (0xffffffff << (32 - prefix)) >>> 0;

      return {
        network: ipNum & mask,
        mask: mask,
        prefix: prefix,
        type: "ipv4",
      };
    }
    // Handle IPv6 CIDR notation (simplified)
    else if (cidr.includes(":")) {
      // For IPv6, we'll use a simplified approach for common cases
      if (cidr === "::1/128" || cidr === "::1") {
        return {
          address: "::1",
          prefix: 128,
          type: "ipv6",
        };
      }
      return null; // More complex IPv6 handling can be added later
    }
  } catch (error) {
    logger.error("Error parsing IP range:", { cidr, error });
    return null;
  }

  return null;
}

// Check if IP is in allowed range
function isIPInRange(clientIP, allowedRanges) {
  if (!clientIP || !allowedRanges || allowedRanges.length === 0) return false;

  try {
    // Handle IPv4
    if (clientIP.includes(".")) {
      const ipParts = clientIP.split(".").map((part) => parseInt(part, 10));
      if (ipParts.length !== 4 || ipParts.some((part) => part < 0 || part > 255)) return false;

      const clientIPNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];

      for (const range of allowedRanges) {
        if (range && range.type === "ipv4") {
          if ((clientIPNum & range.mask) === range.network) {
            return true;
          }
        }
      }
    }
    // Handle IPv6 localhost
    else if (clientIP === "::1" || clientIP === "::ffff:127.0.0.1") {
      return allowedRanges.some(
        (range) => range && range.type === "ipv6" && range.address === "::1"
      );
    }
    // Handle IPv4-mapped IPv6 addresses
    else if (clientIP.startsWith("::ffff:")) {
      const ipv4 = clientIP.replace("::ffff:", "");
      return isIPInRange(ipv4, allowedRanges);
    }
  } catch (error) {
    logger.error("Error checking IP range:", { clientIP, error });
    return false;
  }

  return false;
}

// IP restriction middleware
export const ipRestriction = (() => {
  // Parse configuration
  const isEnabled = process.env.ENABLE_IP_RESTRICTION === "true";
  const restrictionMode = process.env.IP_RESTRICTION_MODE || "strict";
  const allowedRangesStr = process.env.ALLOWED_IP_RANGES || "127.0.0.0/8,::1/128";

  let allowedRanges = [];

  if (isEnabled) {
    allowedRanges = allowedRangesStr
      .split(",")
      .map((range) => range.trim())
      .filter((range) => range.length > 0)
      .map(parseIPRange)
      .filter((range) => range !== null);

    logger.info(`[Security] IP restriction enabled (mode: ${restrictionMode})`);
    logger.info(`[Security] Allowed IP ranges:`, {
      ranges: allowedRanges.map((r) =>
        r.type === "ipv4"
          ? `${(r.network >>> 24) & 0xff}.${(r.network >>> 16) & 0xff}.${(r.network >>> 8) & 0xff}.${r.network & 0xff}/${r.prefix}`
          : r.address + "/" + r.prefix
      ),
    });
  }

  return {
    // Strict mode - block all unauthorized IPs
    strict:
      isEnabled && restrictionMode === "strict"
        ? (req, res, next) => {
            const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

            if (!isIPInRange(clientIP, allowedRanges)) {
              createLogger(req).warn(
                `[Security] Blocked request from unauthorized IP: ${clientIP} to ${req.method} ${req.url}`
              );
              return res.status(403).json({
                error: "Access denied: IP address not authorized",
                code: "IP_RESTRICTED",
              });
            }

            next();
          }
        : (req, res, next) => next(),

    // Admin mode - only restrict admin operations
    admin:
      isEnabled && restrictionMode === "admin"
        ? (req, res, next) => {
            const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

            // Check if user is admin and IP is not in allowed ranges
            if (req.user?.isAdmin && !isIPInRange(clientIP, allowedRanges)) {
              createLogger(req).warn(
                `[Security] Blocked admin operation from unauthorized IP: ${clientIP} to ${req.method} ${req.url}`
              );
              return res.status(403).json({
                error: "Access denied: Admin operations restricted to authorized IPs",
                code: "ADMIN_IP_RESTRICTED",
              });
            }

            next();
          }
        : (req, res, next) => next(),

    // Auth mode - only restrict authentication endpoints
    auth:
      isEnabled && (restrictionMode === "auth" || restrictionMode === "admin")
        ? (req, res, next) => {
            const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

            if (!isIPInRange(clientIP, allowedRanges)) {
              createLogger(req).warn(
                `[Security] Blocked authentication attempt from unauthorized IP: ${clientIP} to ${req.method} ${req.url}`
              );
              return res.status(403).json({
                error: "Access denied: Authentication restricted to authorized IPs",
                code: "AUTH_IP_RESTRICTED",
              });
            }

            next();
          }
        : (req, res, next) => next(),

    // Utility to check if IP restrictions are enabled
    isEnabled,
    restrictionMode,
    allowedRanges,
  };
})();

// Request logging middleware for security monitoring
export const securityLogger = (req, res, next) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id || "anonymous",
    };

    // Log suspicious activity
    if (res.statusCode >= 400 || duration > 5000) {
      createLogger(req).warn("Suspicious request:", logData);
    }
  });

  next();
};
