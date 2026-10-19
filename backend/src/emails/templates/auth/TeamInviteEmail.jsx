import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * TeamInviteEmail
 *
 * Sent when an admin bulk-imports users. Tells the recipient that the
 * organisation added them and prompts them to set their password.
 *
 * @param {Object} props
 * @param {string} props.userName - Recipient's username
 * @param {string} props.organizationName - Organisation that added them
 * @param {string} props.resetUrl - Password-setup URL with token
 * @param {string} props.primaryColor - Organisation brand colour
 * @param {string} props.logoUrl - Organisation logo URL (optional)
 * @param {number} props.expirationMinutes - Link expiry in minutes
 */
export function TeamInviteEmail({
  userName = null,
  organizationName = "Business Review 360",
  resetUrl,
  primaryColor = theme.colors.primary,
  logoUrl = null,
  expirationMinutes = 2880,
}) {
  const previewText = `${organizationName} has added you; set up your account`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>{organizationName} has signed you up</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          {organizationName} has created a Business Review 360 account for you. Click the button
          below to set your password and get started:
        </Text>

        <Section center padding="md">
          <Button href={resetUrl} color={primaryColor}>
            Set up my account
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
          If you weren&apos;t expecting this, contact your {organizationName} administrator.
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

export default TeamInviteEmail;
