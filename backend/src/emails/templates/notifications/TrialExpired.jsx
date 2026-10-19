import { Text, Button } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * TrialExpired Template
 *
 * Sent when a trial tenant transitions to trial_expired status.
 * Confirms the expiry and provides an upgrade CTA.
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin display name
 * @param {string} props.organizationId - Org slug
 * @param {string} props.organizationName - Human-readable org name
 * @param {string} props.appUrl - Base application URL
 */
export function TrialExpired({
  adminName = null,
  _organizationId = null,
  organizationName = "your organisation",
  appUrl = "https://br360.example.com",
}) {
  const previewText = `Your Business Review 360 trial has ended`;
  const upgradeUrl = `${appUrl}/pricing`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="Business Review 360" primaryColor={theme.colors.error} />

      <Section>
        <Text style={styles.heading}>Your free trial has ended</Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Your 14-day free trial for <strong>{organizationName}</strong> has expired. Your account
          is now in read-only mode: your data is safe but new submissions and changes are paused
          until you upgrade.
        </Text>

        <Button href={upgradeUrl} style={styles.button}>
          Upgrade to keep access
        </Button>
      </Section>

      <Divider />

      <Section>
        <Text style={styles.paragraph}>
          All your ideas, categories, and settings are preserved. Upgrading takes less than two
          minutes and restores full access immediately.
        </Text>

        <Text style={styles.paragraph}>
          If you have any questions, reply to this email and we will help you find the right plan.
        </Text>
      </Section>

      <Footer organizationName="Business Review 360" showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  heading: {
    fontSize: "24px",
    fontWeight: "bold",
    color: theme.colors.error,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  paragraph: {
    fontSize: "16px",
    color: theme.colors.textSecondary,
    lineHeight: "1.6",
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  button: {
    backgroundColor: theme.colors.primary,
    color: "#ffffff",
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    borderRadius: theme.borderRadius.md,
    fontWeight: "600",
    fontSize: "16px",
    textDecoration: "none",
    display: "inline-block",
    margin: `${theme.spacing.md} 0`,
  },
};
