import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * Welcome Email Template
 *
 * Sent when a new user account is created.
 *
 * @param {Object} props
 * @param {string} props.userName - User's display name
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.organizationId - Organization slug
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {string} props.loginUrl - URL to login page
 * @param {string} props.ideasUrl - URL to ideas page
 * @param {string} props.adminEmail - Admin contact email (optional)
 */
export function Welcome({
  userName = "there",
  organizationName = "Business Review 360",
  _organizationId,
  primaryColor = theme.colors.primary,
  logoUrl = null,
  loginUrl,
  ideasUrl,
  adminEmail = null,
}) {
  const previewText = `Welcome to ${organizationName}! Your account is ready.`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>Welcome to {organizationName}!</Text>

        <Text style={styles.paragraph}>Hi {userName},</Text>

        <Text style={styles.paragraph}>
          Your account has been created and you're ready to start sharing ideas to help improve{" "}
          {organizationName}.
        </Text>

        <Section center padding="md">
          <Button href={loginUrl || ideasUrl} color={primaryColor}>
            Get Started
          </Button>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.subheading}>What you can do:</Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>•</span>
          <strong>Submit ideas</strong> - Share your suggestions for improvements
        </Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>•</span>
          <strong>Vote on ideas</strong> - Support ideas you think are valuable
        </Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>•</span>
          <strong>Comment and discuss</strong> - Collaborate with your colleagues
        </Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>•</span>
          <strong>Track progress</strong> - See which ideas get implemented
        </Text>

        {ideasUrl && (
          <Text style={styles.paragraphSmall}>
            <Link href={ideasUrl} style={{ color: primaryColor }}>
              Browse existing ideas →
            </Link>
          </Text>
        )}

        <Divider margin="lg" />

        {adminEmail && (
          <Text style={styles.paragraphSmall}>
            Need help? Contact your administrator at{" "}
            <Link href={`mailto:${adminEmail}`} style={{ color: primaryColor }}>
              {adminEmail}
            </Link>
          </Text>
        )}

        <Text style={styles.signoff}>Welcome aboard!</Text>

        <Text style={styles.signoff}>The {organizationName} Team</Text>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  heading: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  subheading: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
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
    margin: `${theme.spacing.md} 0`,
  },
  listItem: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.relaxed,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
    paddingLeft: theme.spacing.md,
  },
  bullet: {
    color: theme.colors.primary,
    marginRight: theme.spacing.sm,
  },
  signoff: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
};

export default Welcome;
