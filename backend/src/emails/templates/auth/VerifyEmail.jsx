import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * VerifyEmail Template
 *
 * Sent when a user needs to verify their email address.
 *
 * @param {Object} props
 * @param {string} props.userName - User's display name (optional)
 * @param {string} props.verificationUrl - Email verification URL with token
 * @param {string} props.verificationCode - 6-digit verification code (optional)
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {number} props.expirationHours - Link expiration time in hours
 */
export function VerifyEmail({
  userName = null,
  verificationUrl,
  verificationCode = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
  expirationHours = 24,
}) {
  const previewText = `Verify your email address for ${organizationName}`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>Verify Your Email Address</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Please verify your email address to complete your registration with {organizationName}.
          Click the button below to confirm your email:
        </Text>

        <Section center padding="md">
          <Button href={verificationUrl} color={primaryColor}>
            Verify Email Address
          </Button>
        </Section>

        {verificationCode && (
          <>
            <Text style={styles.paragraphSmall}>Or enter this verification code:</Text>

            <Text style={styles.code}>{verificationCode}</Text>
          </>
        )}

        <Text style={styles.paragraphSmall}>Or copy and paste this link into your browser:</Text>

        <Text style={styles.linkText}>
          <Link href={verificationUrl} style={{ color: primaryColor }}>
            {verificationUrl}
          </Link>
        </Text>

        <Divider margin="lg" />

        <Text style={styles.securityNotice}>
          This link will expire in {expirationHours} {expirationHours === 1 ? "hour" : "hours"}.
        </Text>

        <Text style={styles.securityNotice}>
          If you didn't create an account with {organizationName}, you can safely ignore this email.
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
  code: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    fontFamily: "monospace",
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundLight,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    borderRadius: theme.borderRadius.md,
    textAlign: "center",
    letterSpacing: "4px",
    margin: `${theme.spacing.sm} 0 ${theme.spacing.md} 0`,
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
};

export default VerifyEmail;
