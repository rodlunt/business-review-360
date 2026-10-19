/**
 * Organisation ID Validation Utilities (Frontend)
 *
 * Validates organisation IDs (organizationId) to ensure they:
 * 1. Follow the format: ^[a-z0-9-]{3,30}$
 * 2. Don't use reserved system names
 * 3. Are automatically lowercased
 *
 * Part of Issue #331 - Reserved organizationId validation
 *
 * NOTE: This is a frontend copy of the backend validation.
 * Changes should be synchronised between:
 * - backend/src/utils/orgIdValidation.js
 * - frontend/src/utils/orgIdValidation.js
 */

/**
 * Reserved organisation IDs that cannot be used
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

  // Organisation related
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
 * Regex pattern for valid organisation IDs
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
 * Validate an organisation ID
 *
 * @param {string} organizationId - The organisation ID to validate
 * @returns {Object} { valid: boolean, error: string|null, sanitized: string|null }
 */
export function validateOrgId(organizationId) {
  // Check if organizationId provided
  if (!organizationId || typeof organizationId !== "string") {
    return {
      valid: false,
      error: "Organisation ID is required",
      sanitized: null,
    };
  }

  // Trim and lowercase
  const sanitized = organizationId.trim().toLowerCase();

  // Check length
  if (sanitized.length < VALIDATION_RULES.MIN_LENGTH) {
    return {
      valid: false,
      error: `Organisation ID must be at least ${VALIDATION_RULES.MIN_LENGTH} characters`,
      sanitized,
    };
  }

  if (sanitized.length > VALIDATION_RULES.MAX_LENGTH) {
    return {
      valid: false,
      error: `Organisation ID must be at most ${VALIDATION_RULES.MAX_LENGTH} characters`,
      sanitized,
    };
  }

  // Check format (lowercase alphanumeric + hyphens only)
  if (!ORG_ID_REGEX.test(sanitized)) {
    return {
      valid: false,
      error: "Organisation ID can only contain lowercase letters, numbers, and hyphens",
      sanitized,
    };
  }

  // Check cannot start with hyphen
  if (VALIDATION_RULES.CANNOT_START_WITH_HYPHEN && sanitized.startsWith("-")) {
    return {
      valid: false,
      error: "Organisation ID cannot start with a hyphen",
      sanitized,
    };
  }

  // Check cannot end with hyphen
  if (VALIDATION_RULES.CANNOT_END_WITH_HYPHEN && sanitized.endsWith("-")) {
    return {
      valid: false,
      error: "Organisation ID cannot end with a hyphen",
      sanitized,
    };
  }

  // Check cannot have consecutive hyphens
  if (VALIDATION_RULES.CANNOT_HAVE_CONSECUTIVE_HYPHENS && sanitized.includes("--")) {
    return {
      valid: false,
      error: "Organisation ID cannot contain consecutive hyphens",
      sanitized,
    };
  }

  // Check reserved list
  if (RESERVED_ORG_IDS.includes(sanitized)) {
    return {
      valid: false,
      error: `"${sanitized}" is a reserved name and cannot be used. Please choose a different organisation ID.`,
      sanitized,
    };
  }

  // Check uniqueness will be handled by API

  return {
    valid: true,
    error: null,
    sanitized,
  };
}

/**
 * Check if an organizationId is reserved
 *
 * @param {string} organizationId - The organisation ID to check
 * @returns {boolean} true if reserved, false otherwise
 */
export function isReservedOrgId(organizationId) {
  if (!organizationId || typeof organizationId !== "string") {
    return false;
  }
  return RESERVED_ORG_IDS.includes(organizationId.trim().toLowerCase());
}

/**
 * Sanitise an organizationId (lowercase, trim)
 * This does NOT validate, only normalises
 *
 * @param {string} organizationId - The organisation ID to sanitise
 * @returns {string} Sanitised organizationId
 */
export function sanitizeOrgId(organizationId) {
  if (!organizationId || typeof organizationId !== "string") {
    return "";
  }
  return organizationId.trim().toLowerCase();
}

/**
 * Real-time validation helper for text fields
 * Returns null if valid, error message if invalid
 *
 * @param {string} organizationId - The organisation ID to validate
 * @param {boolean} allowEmpty - Whether empty string is valid (default: false)
 * @returns {string|null} Error message or null if valid
 */
export function getOrgIdError(organizationId, allowEmpty = false) {
  if (allowEmpty && (!organizationId || !organizationId.trim())) {
    return null;
  }

  const result = validateOrgId(organizationId);
  return result.valid ? null : result.error;
}
