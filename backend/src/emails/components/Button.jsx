import { Button as ReactEmailButton } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * Button - Styled CTA button component
 *
 * Provides consistent button styling across all email templates.
 * Supports primary, secondary, and outline variants.
 *
 * @param {Object} props
 * @param {string} props.href - Button link URL
 * @param {React.ReactNode} props.children - Button text
 * @param {string} props.variant - 'primary' | 'secondary' | 'outline' | 'success' | 'warning'
 * @param {string} props.color - Override color (optional)
 * @param {boolean} props.fullWidth - Whether button should be full width
 */
export function Button({ href, children, variant = "primary", color = null, fullWidth = false }) {
  const variantStyles = getVariantStyles(variant, color);

  return (
    <ReactEmailButton
      href={href}
      style={{
        ...styles.base,
        ...variantStyles,
        ...(fullWidth ? styles.fullWidth : {}),
      }}
    >
      {children}
    </ReactEmailButton>
  );
}

function getVariantStyles(variant, customColor) {
  const variants = {
    primary: {
      backgroundColor: customColor || theme.colors.primary,
      color: "#ffffff",
      border: `2px solid ${customColor || theme.colors.primary}`,
    },
    secondary: {
      backgroundColor: theme.colors.textSecondary,
      color: "#ffffff",
      border: `2px solid ${theme.colors.textSecondary}`,
    },
    outline: {
      backgroundColor: "transparent",
      color: customColor || theme.colors.primary,
      border: `2px solid ${customColor || theme.colors.primary}`,
    },
    success: {
      backgroundColor: theme.colors.success,
      color: "#ffffff",
      border: `2px solid ${theme.colors.success}`,
    },
    warning: {
      backgroundColor: theme.colors.warning,
      color: "#ffffff",
      border: `2px solid ${theme.colors.warning}`,
    },
    error: {
      backgroundColor: theme.colors.error,
      color: "#ffffff",
      border: `2px solid ${theme.colors.error}`,
    },
  };

  return variants[variant] || variants.primary;
}

const styles = {
  base: {
    display: "inline-block",
    padding: theme.dimensions.buttonPadding,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    fontFamily: theme.typography.fontFamily,
    textDecoration: "none",
    textAlign: "center",
    borderRadius: theme.borderRadius.md,
    cursor: "pointer",
    lineHeight: "1",
  },
  fullWidth: {
    display: "block",
    width: "100%",
    textAlign: "center",
  },
};

export default Button;
