/**
 * Organization ID Validation Utilities
 *
 * Validates organization IDs (organizationId) to ensure they:
 * 1. Follow the format: ^[a-z0-9-]{3,30}$
 * 2. Don't use reserved system names
 * 3. Are automatically lowercased
 *
 * Part of Issue #331 - Reserved organizationId validation
 * Refactored in Issue #459 - Standardized naming from orgId to organizationId
 */

/**
 * Reserved organization IDs that cannot be used
 * These are reserved for system routes, features, or to prevent confusion
 */
export const RESERVED_ORG_IDS = [
  // System routes
  "api",
  "admin",
  "www",
  "app",
  "auth",
  "login",
  "logout",
  "register",
  "signup",
  "signin",

  // Common subdomains
  "mail",
  "email",
  "smtp",
  "pop",
  "imap",
  "ftp",
  "sftp",
  "ssh",
  "vpn",

  // System features
  "health",
  "status",
  "metrics",
  "analytics",
  "billing",
  "payment",
  "checkout",
  "invoice",
  "subscription",
  "plan",
  "pricing",

  // Asset/static routes
  "static",
  "assets",
  "public",
  "cdn",
  "media",
  "images",
  "img",
  "js",
  "css",
  "fonts",

  // User/auth related
  "user",
  "users",
  "profile",
  "account",
  "settings",
  "password",
  "reset",
  "verify",
  "confirm",

  // Organization related
  "org",
  "organization",
  "organizations",
  "team",
  "teams",
  "tenant",
  "tenants",
  "company",
  "companies",

  // Content/features
  "idea",
  "ideas",
  "comment",
  "comments",
  "vote",
  "votes",
  "category",
  "categories",
  "tag",
  "tags",
  "search",
  "filter",

  // Support/legal
  "support",
  "help",
  "docs",
  "documentation",
  "faq",
  "contact",
  "about",
  "terms",
  "privacy",
  "legal",
  "security",

  // Test/dev
  "test",
  "testing",
  "demo",
  "sandbox",
  "dev",
  "development",
  "staging",
  "prod",
  "production",

  // Dashboard/app sections
  "dashboard",
  "overview",
  "reports",
  "export",
  "import",
  "backup",
  "restore",

  // Webhooks/integrations
  "webhook",
  "webhooks",
  "integration",
  "integrations",
  "callback",
  "oauth",

  // Potentially confusing
  "null",
  "undefined",
  "true",
  "false",
  "none",
  "empty",

  // Profanity/inappropriate (basic list)
  "admin123",
  "root",
  "system",
  "internal",

  // Branding protection
  "br360",
  "businessreview",
  "business-review",
];

/**
 * Regex pattern for valid organization IDs
 * - Lowercase letters (a-z)
 * - Numbers (0-9)
 * - Hyphens (-)
 * - Length: 3-30 characters
 */
export const ORG_ID_REGEX = /^[a-z0-9-]{3,30}$/;

/**
 * Additional validation rules
 */
const VALIDATION_RULES = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 30,
  CANNOT_START_WITH_HYPHEN: true,
  CANNOT_END_WITH_HYPHEN: true,
  CANNOT_HAVE_CONSECUTIVE_HYPHENS: true,
};

/**
 * Validate an organization ID
 *
 * @param {string} organizationId - The organization ID to validate
 * @returns {Object} { valid: boolean, error: string|null, sanitized: string|null }
 */
export function validateOrganizationId(organizationId) {
  // Check if organizationId provided
  if (!organizationId || typeof organizationId !== "string") {
    return {
      valid: false,
      error: "Organization ID is required",
      sanitized: null,
    };
  }

  // Trim and lowercase
  const sanitized = organizationId.trim().toLowerCase();

  // Check length
  if (sanitized.length < VALIDATION_RULES.MIN_LENGTH) {
    return {
      valid: false,
      error: `Organization ID must be at least ${VALIDATION_RULES.MIN_LENGTH} characters`,
      sanitized,
    };
  }

  if (sanitized.length > VALIDATION_RULES.MAX_LENGTH) {
    return {
      valid: false,
      error: `Organization ID must be at most ${VALIDATION_RULES.MAX_LENGTH} characters`,
      sanitized,
    };
  }

  // Check format (lowercase alphanumeric + hyphens only)
  if (!ORG_ID_REGEX.test(sanitized)) {
    return {
      valid: false,
      error: "Organization ID can only contain lowercase letters, numbers, and hyphens",
      sanitized,
    };
  }

  // Check cannot start with hyphen
  if (VALIDATION_RULES.CANNOT_START_WITH_HYPHEN && sanitized.startsWith("-")) {
    return {
      valid: false,
      error: "Organization ID cannot start with a hyphen",
      sanitized,
    };
  }

  // Check cannot end with hyphen
  if (VALIDATION_RULES.CANNOT_END_WITH_HYPHEN && sanitized.endsWith("-")) {
    return {
      valid: false,
      error: "Organization ID cannot end with a hyphen",
      sanitized,
    };
  }

  // Check cannot have consecutive hyphens
  if (VALIDATION_RULES.CANNOT_HAVE_CONSECUTIVE_HYPHENS && sanitized.includes("--")) {
    return {
      valid: false,
      error: "Organization ID cannot contain consecutive hyphens",
      sanitized,
    };
  }

  // Check reserved list
  if (RESERVED_ORG_IDS.includes(sanitized)) {
    return {
      valid: false,
      error: `"${sanitized}" is a reserved name and cannot be used. Please choose a different organization ID.`,
      sanitized,
    };
  }

  // Check uniqueness will be handled by database/API layer

  return {
    valid: true,
    error: null,
    sanitized,
  };
}

/**
 * Check if an organizationId is reserved
 *
 * @param {string} organizationId - The organization ID to check
 * @returns {boolean} true if reserved, false otherwise
 */
export function isReservedOrganizationId(organizationId) {
  if (!organizationId || typeof organizationId !== "string") {
    return false;
  }
  return RESERVED_ORG_IDS.includes(organizationId.trim().toLowerCase());
}

/**
 * Sanitize an organizationId (lowercase, trim)
 * This does NOT validate, only normalizes
 *
 * @param {string} organizationId - The organization ID to sanitize
 * @returns {string} Sanitized organizationId
 */
export function sanitizeOrganizationId(organizationId) {
  if (!organizationId || typeof organizationId !== "string") {
    return "";
  }
  return organizationId.trim().toLowerCase();
}

/**
 * Generate validation error response for API
 *
 * @param {string} organizationId - The invalid organization ID
 * @returns {Object} Express error response object
 */
export function getOrganizationIdValidationError(organizationId) {
  const result = validateOrganizationId(organizationId);

  if (result.valid) {
    return null;
  }

  return {
    error: result.error,
    code: "INVALID_ORG_ID",
    field: "organizationId",
    provided: organizationId,
    sanitized: result.sanitized,
  };
}

/**
 * Express middleware to validate organizationId in request
 * Can check params, query, or body
 *
 * Usage:
 *   app.post("/api/organizations", validateOrganizationIdMiddleware("body"), ...);
 *   app.get("/api/org/:organizationId", validateOrganizationIdMiddleware("params"), ...);
 *
 * @param {string} source - Where to find organizationId: "params", "query", or "body"
 * @param {string} field - Field name (default: "organizationId")
 * @returns {Function} Express middleware
 */
export function validateOrganizationIdMiddleware(source = "body", field = "organizationId") {
  return (req, res, next) => {
    // Get organizationId from specified source
    const organizationId = req[source]?.[field];

    // Skip validation if no organizationId present (let other middleware handle required check)
    if (!organizationId) {
      return next();
    }

    // Validate organizationId
    const result = validateOrganizationId(organizationId);

    if (!result.valid) {
      return res.status(400).json({
        error: result.error,
        code: "INVALID_ORG_ID",
        field: field,
        provided: organizationId,
        sanitized: result.sanitized,
      });
    }

    // Replace with sanitized version
    req[source][field] = result.sanitized;

    next();
  };
}

// Backward compatibility aliases
export const validateOrgId = validateOrganizationId;
export const isReservedOrgId = isReservedOrganizationId;
export const sanitizeOrgId = sanitizeOrganizationId;
export const getOrgIdValidationError = getOrganizationIdValidationError;
export const validateOrgIdMiddleware = validateOrganizationIdMiddleware;
