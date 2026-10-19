import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * PasswordChanged Template
 *
 * Sent when a user's password has been successfully changed.
 *
 * @param {Object} props
 * @param {string} props.userName - User's display name (optional)
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {string} props.changeTimestamp - When the password was changed
 * @param {string} props.resetUrl - URL to reset password if unauthorized
 * @param {string} props.adminEmail - Admin contact email
 */
export function PasswordChanged({
  userName = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
  changeTimestamp = null,
  resetUrl = null,
  adminEmail = null,
}) {
  const previewText = `Your password has been changed for ${organizationName}`;
  const formattedTime = changeTimestamp
    ? new Date(changeTimestamp).toLocaleString("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Australia/Sydney",
      })
    : "just now";

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>Password Changed Successfully</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Your password for {organizationName} was successfully changed on{" "}
          <strong>{formattedTime}</strong>.
        </Text>

        <Section backgroundColor={theme.colors.backgroundLight} padding="md">
          <Text style={styles.confirmationText}>✓ Password changed successfully</Text>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.warningHeading}>Didn't make this change?</Text>

        <Text style={styles.paragraph}>
          If you didn't change your password, your account may have been compromised. Please take
          immediate action:
        </Text>

        {resetUrl && (
          <Section center padding="md">
            <Button href={resetUrl} variant="error">
              Reset Password Now
            </Button>
          </Section>
        )}

        {adminEmail && (
          <Text style={styles.paragraphSmall}>
            Contact your administrator immediately at{" "}
            <Link href={`mailto:${adminEmail}`} style={{ color: primaryColor }}>
              {adminEmail}
            </Link>
          </Text>
        )}

        <Divider margin="lg" />

        <Text style={styles.securityNotice}>For your security, we recommend:</Text>

        <Text style={styles.securityTip}>• Use a strong, unique password</Text>
        <Text style={styles.securityTip}>• Don't share your password with anyone</Text>
        <Text style={styles.securityTip}>• Log out of shared devices after use</Text>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  heading: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  warningHeading: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.error,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  paragraphSmall: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `${theme.spacing.md} 0`,
  },
  confirmationText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.success,
    margin: "0",
    textAlign: "center",
  },
  securityNotice: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  securityTip: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    margin: `0 0 ${theme.spacing.xs} 0`,
    paddingLeft: theme.spacing.sm,
  },
};

export default PasswordChanged;
