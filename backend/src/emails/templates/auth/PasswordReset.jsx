import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * PasswordReset Email Template
 *
 * Sent when a user requests a password reset, or (isSetup=true) when an
 * admin bulk-imports an account and the user needs to set their first password.
 *
 * @param {Object} props
 * @param {string} props.userName - User's display name (optional)
 * @param {string} props.resetUrl - Password reset URL with token
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {number} props.expirationMinutes - Link expiration time in minutes
 * @param {boolean} props.isSetup - True for new-account setup, false for reset
 */
export function PasswordReset({
  userName = null,
  resetUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
  expirationMinutes = 60,
  isSetup = false,
}) {
  const previewText = isSetup
    ? `Set up your ${organizationName} account`
    : `Reset your password for ${organizationName}`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>
          {isSetup ? "Set Up Your Account" : "Password Reset Request"}
        </Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          {isSetup
            ? `An account has been created for you on ${organizationName}. Click the button below to set up your password and get started:`
            : `You requested a password reset for your ${organizationName} account. Click the button below to reset your password:`}
        </Text>

        <Section center padding="md">
          <Button href={resetUrl} color={primaryColor}>
            {isSetup ? "Set Up Password" : "Reset Password"}
          </Button>
        </Section>

        <Text style={styles.paragraphSmall}>Or copy and paste this link into your browser:</Text>

        <Text style={styles.linkText}>
          <Link href={resetUrl} style={{ color: primaryColor }}>
            {resetUrl}
          </Link>
        </Text>

        <Divider margin="lg" />

        <Text style={styles.securityNotice}>
          {isSetup
            ? `If you weren't expecting this, contact your ${organizationName} administrator.`
            : "If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged."}
        </Text>

        <Text style={styles.expirationNotice}>
          This link will expire in {expirationMinutes}{" "}
          {expirationMinutes === 1 ? "minute" : "minutes"}.
        </Text>
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
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  paragraphSmall: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `${theme.spacing.md} 0 ${theme.spacing.xs} 0`,
  },
  linkText: {
    fontSize: theme.typography.fontSize.sm,
    wordBreak: "break-all",
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  securityNotice: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  expirationNotice: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    margin: "0",
  },
};

export default PasswordReset;
