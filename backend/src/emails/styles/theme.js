/**
 * Email Theme Configuration
 *
 * Defines the design system for all email templates including
 * organization-specific branding, colors, typography, and spacing.
 */

// Organization-specific branding
// These are fetched from the database at runtime, but we define defaults here
export const organizationDefaults = {
  "demo-corp": {
    name: "Demo Corp",
    primaryColor: "#1976d2",
    logoUrl: null,
  },
  tradezone: {
    name: "TradeZone",
    primaryColor: "#00667e",
    logoUrl: null,
  },
  parklane: {
    name: "Parklane",
    primaryColor: "#0067b1",
    logoUrl: null,
  },
  nps: {
    name: "NPS",
    primaryColor: "#193f6f",
    logoUrl: null,
  },
};

// Default theme colors
export const colors = {
  // Brand colors
  primary: "#1976d2",
  primaryDark: "#1565c0",
  primaryLight: "#42a5f5",

  // Status colors
  success: "#2e7d32",
  successLight: "#4caf50",
  warning: "#ed6c02",
  warningLight: "#ff9800",
  error: "#d32f2f",
  errorLight: "#ef5350",
  info: "#0288d1",
  infoLight: "#03a9f4",

  // Neutral colors
  text: "#333333",
  textSecondary: "#666666",
  textMuted: "#999999",

  // Background colors
  background: "#f5f5f5",
  backgroundWhite: "#ffffff",
  backgroundLight: "#fafafa",

  // Border colors
  border: "#e0e0e0",
  borderLight: "#eeeeee",

  // Status badge colors
  statusReviewing: "#ed6c02",
  statusApproved: "#2e7d32",
  statusImplemented: "#1976d2",
  statusRejected: "#d32f2f",
  statusSubmitted: "#9e9e9e",
};

// Typography
export const typography = {
  fontFamily: "Arial, Helvetica, sans-serif",

  // Font sizes
  fontSize: {
    xs: "12px",
    sm: "14px",
    base: "16px",
    lg: "18px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "30px",
  },

  // Font weights
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  // Line heights
  lineHeight: {
    tight: "1.25",
    normal: "1.5",
    relaxed: "1.75",
  },
};

// Spacing (consistent with 8px grid)
export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
  "3xl": "64px",
};

// Border radius
export const borderRadius = {
  sm: "2px",
  md: "4px",
  lg: "8px",
  full: "9999px",
};

// Shadows
export const shadows = {
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px rgba(0, 0, 0, 0.1)",
};

// Email-specific dimensions
export const dimensions = {
  maxWidth: "600px",
  containerPadding: "24px",
  buttonPadding: "12px 24px",
  cardPadding: "16px",
};

/**
 * Get organization-specific theme
 * @param {Object} organization - Organization object from database
 * @returns {Object} Theme object with organization branding
 */
export function getOrganizationTheme(organization) {
  const orgId = organization?.organizationId || organization?.id;
  const defaults = organizationDefaults[orgId] || {};

  return {
    name: organization?.organizationName || defaults.name || "Business Review 360",
    primaryColor: organization?.primaryColor || defaults.primaryColor || colors.primary,
    logoUrl: organization?.logoUrl || defaults.logoUrl || null,
    logoHighContrast: organization?.logoHighContrast || false,
  };
}

/**
 * Get status badge styling
 * @param {string} status - Idea status
 * @returns {Object} Style object for status badge
 */
export function getStatusStyle(status) {
  const statusColors = {
    Submitted: { bg: "#f5f5f5", text: "#666666", border: "#e0e0e0" },
    Reviewing: { bg: "#fff3e0", text: "#e65100", border: "#ffcc80" },
    Approved: { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" },
    Implemented: { bg: "#e3f2fd", text: "#1565c0", border: "#90caf9" },
    Rejected: { bg: "#ffebee", text: "#c62828", border: "#ef9a9a" },
  };

  return statusColors[status] || statusColors["Submitted"];
}

// Export complete theme object
export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  dimensions,
  organizationDefaults,
  getOrganizationTheme,
  getStatusStyle,
};

export default theme;
