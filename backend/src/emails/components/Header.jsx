import { Section, Img, Text } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * Header - Email header component with organization branding
 *
 * Displays organization logo (if available) and/or name.
 * Falls back to "Business Review 360" branding.
 *
 * @param {Object} props
 * @param {string} props.organizationName - Display name of the organization
 * @param {string} props.primaryColor - Brand color (hex)
 * @param {string} props.logoUrl - URL to organization logo (optional)
 */
export function Header({
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  return (
    <Section style={styles.header}>
      {logoUrl ? (
        <Img src={logoUrl} alt={organizationName} width="180" height="auto" style={styles.logo} />
      ) : (
        <Text style={{ ...styles.brandName, color: primaryColor }}>{organizationName}</Text>
      )}
    </Section>
  );
}

const styles = {
  header: {
    backgroundColor: theme.colors.backgroundWhite,
    padding: theme.spacing.lg,
    textAlign: "center",
    borderRadius: `${theme.borderRadius.lg} ${theme.borderRadius.lg} 0 0`,
  },
  logo: {
    display: "block",
    margin: "0 auto",
    maxWidth: "180px",
    height: "auto",
  },
  brandName: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    margin: "0",
    padding: "0",
  },
};

export default Header;
