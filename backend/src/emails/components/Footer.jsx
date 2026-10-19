import { Section, Text, Link, Hr } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * Footer - Email footer component
 *
 * Displays organization info, unsubscribe links, and legal text.
 *
 * @param {Object} props
 * @param {string} props.organizationName - Display name of the organization
 * @param {string} props.unsubscribeUrl - URL for unsubscribe action (optional)
 * @param {string} props.preferencesUrl - URL for email preferences (optional)
 * @param {boolean} props.showUnsubscribe - Whether to show unsubscribe links
 */
export function Footer({
  organizationName = "Business Review 360",
  unsubscribeUrl = null,
  preferencesUrl = null,
  showUnsubscribe = true,
}) {
  const currentYear = new Date().getFullYear();

  return (
    <Section style={styles.footer}>
      <Hr style={styles.divider} />

      <Text style={styles.wordmark}>
        <span style={styles.wordmarkText}>Business Review </span>
        <span style={styles.wordmarkAccent}>360</span>
      </Text>

      {showUnsubscribe && (unsubscribeUrl || preferencesUrl) && (
        <Text style={styles.linksText}>
          {unsubscribeUrl && (
            <Link href={unsubscribeUrl} style={styles.link}>
              Unsubscribe
            </Link>
          )}
          {unsubscribeUrl && preferencesUrl && <span style={styles.separator}> | </span>}
          {preferencesUrl && (
            <Link href={preferencesUrl} style={styles.link}>
              Email preferences
            </Link>
          )}
        </Text>
      )}

      <Text style={styles.legalText}>
        &copy; {currentYear} Business Review 360. All rights reserved.
      </Text>

      <Text style={styles.legalText}>
        This email was sent because you have an account with {organizationName}. If you believe you
        received this email in error, please contact your administrator.
      </Text>
    </Section>
  );
}

const styles = {
  footer: {
    backgroundColor: theme.colors.backgroundLight,
    padding: theme.spacing.lg,
    textAlign: "center",
    borderRadius: `0 0 ${theme.borderRadius.lg} ${theme.borderRadius.lg}`,
  },
  divider: {
    borderColor: theme.colors.border,
    borderTop: `1px solid ${theme.colors.border}`,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  wordmark: {
    margin: `0 0 ${theme.spacing.sm} 0`,
    textAlign: "center",
  },
  wordmarkText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: "-0.025em",
  },
  wordmarkAccent: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primaryDark,
    letterSpacing: "-0.025em",
  },
  footerText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  linksText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  link: {
    color: theme.colors.primary,
    textDecoration: "underline",
  },
  separator: {
    color: theme.colors.textMuted,
  },
  legalText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    margin: `0 0 ${theme.spacing.xs} 0`,
    lineHeight: theme.typography.lineHeight.normal,
  },
};

export default Footer;
