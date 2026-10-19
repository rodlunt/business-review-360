import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * UserAccountApproved Template
 *
 * Sent to a user when their account has been approved by an admin.
 *
 * @param {Object} props
 * @param {string} props.userName - User's display name (optional)
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {string} props.loginUrl - URL to login page
 * @param {string} props.ideasUrl - URL to browse ideas
 */
export function UserAccountApproved({
  userName = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
  loginUrl,
  ideasUrl,
}) {
  const previewText = `Your ${organizationName} account has been approved!`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.celebration}>🎉</Text>

        <Text style={styles.heading}>Your Account Has Been Approved!</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Great news! Your account for <strong>{organizationName}</strong> has been approved by an
          administrator. You can now log in and start contributing ideas.
        </Text>

        <Section center padding="md">
          <Button href={loginUrl} color={primaryColor}>
            Log In Now
          </Button>
        </Section>

        {ideasUrl && (
          <Section center padding="sm">
            <Button href={ideasUrl} variant="outline" color={primaryColor}>
              Browse Ideas
            </Button>
          </Section>
        )}

        <Divider margin="lg" />

        <Text style={styles.subheading}>What's next?</Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>1.</span>
          Log in with your credentials
        </Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>2.</span>
          Browse existing ideas from your colleagues
        </Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>3.</span>
          Submit your own ideas for improvement
        </Text>

        <Text style={styles.listItem}>
          <span style={styles.bullet}>4.</span>
          Vote and comment to help prioritize ideas
        </Text>

        <Divider margin="lg" />

        <Text style={styles.welcomeText}>
          We're excited to have you on board. Your ideas can make a real difference!
        </Text>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  celebration: {
    fontSize: "48px",
    textAlign: "center",
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  heading: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
    margin: `0 0 ${theme.spacing.lg} 0`,
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
  listItem: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.relaxed,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
    paddingLeft: theme.spacing.sm,
  },
  bullet: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
    marginRight: theme.spacing.sm,
  },
  welcomeText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    margin: "0",
  },
};

export default UserAccountApproved;
