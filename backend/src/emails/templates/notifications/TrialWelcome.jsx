import { Text, Button } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * TrialWelcome Template
 *
 * Sent to a new user when their 14-day free trial begins.
 * Confirms trial dates and links them into the app.
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin user display name
 * @param {string} props.adminEmail - Admin email address
 * @param {string} props.organizationId - Org slug (for app URL)
 * @param {string} props.organizationName - Human-readable org name
 * @param {string} props.trialEndsAt - ISO string for trial expiry
 * @param {string} props.appUrl - Base application URL
 */
export function TrialWelcome({
  adminName = null,
  _adminEmail = null,
  organizationId = null,
  organizationName = "your organisation",
  trialEndsAt = null,
  appUrl = "https://br360.example.com",
}) {
  const previewText = `Your 14-day free trial of Business Review 360 has started`;

  const formattedExpiry = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-AU", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const loginUrl = organizationId ? `${appUrl}/org/${organizationId}/login` : appUrl;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="Business Review 360" primaryColor={theme.colors.primary} />

      <Section>
        <Text style={styles.heading}>Your free trial has started</Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Welcome to Business Review 360! Your 14-day free trial for{" "}
          <strong>{organizationName}</strong> is now active. You have full Professional access with
          no credit card required.
        </Text>

        {formattedExpiry && (
          <Section
            backgroundColor={theme.colors.backgroundLight}
            padding="md"
            style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
          >
            <Text style={styles.metaLabel}>Trial expires</Text>
            <Text style={styles.metaValue}>{formattedExpiry}</Text>
          </Section>
        )}

        <Text style={styles.paragraph}>Get started by logging in and inviting your team:</Text>

        <Button href={loginUrl} style={styles.button}>
          Go to your workspace
        </Button>
      </Section>

      <Divider />

      <Section>
        <Text style={styles.subheading}>What you can do during your trial</Text>
        <Text style={styles.listItem}>
          Capture and organise up to 500 business improvement ideas
        </Text>
        <Text style={styles.listItem}>Invite up to 50 team members</Text>
        <Text style={styles.listItem}>Use analytics and priority matrices</Text>
        <Text style={styles.listItem}>Set up custom categories and approval workflows</Text>
      </Section>

      <Divider />

      <Section>
        <Text style={styles.paragraph}>
          We will send you a reminder a few days before your trial ends. If you have any questions,
          reply to this email and we will get back to you.
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
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  subheading: {
    fontSize: "18px",
    fontWeight: "600",
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  paragraph: {
    fontSize: "16px",
    color: theme.colors.textSecondary,
    lineHeight: "1.6",
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  metaLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 4px 0",
  },
  metaValue: {
    fontSize: "16px",
    fontWeight: "600",
    color: theme.colors.text,
    margin: "0",
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
  listItem: {
    fontSize: "15px",
    color: theme.colors.textSecondary,
    lineHeight: "1.6",
    margin: `0 0 ${theme.spacing.xs} 0`,
    paddingLeft: "1.2em",
  },
};
