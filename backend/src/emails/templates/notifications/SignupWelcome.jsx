import { Text, Button } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * SignupWelcome Template
 *
 * Sent to the admin user when a paid Stripe checkout completes and the
 * organisation has been provisioned. No trial framing; the account is active.
 *
 * @param {Object} props
 * @param {string|null} props.adminName - Customer display name from Stripe (may be null)
 * @param {string} props.organizationId - Org slug (for login URL)
 * @param {string} props.organizationName - Human-readable org name
 * @param {string} props.planId - Plan code (sme, pro, enterprise)
 * @param {string} props.appUrl - Base application URL
 */
export function SignupWelcome({
  adminName = null,
  organizationId = null,
  organizationName = "your organisation",
  planId = null,
  appUrl = "https://br360.example.com",
}) {
  const previewText = `Your Business Review 360 account is ready`;

  const loginUrl = organizationId ? `${appUrl}/org/${organizationId}/login` : appUrl;

  const planLabel = planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : null;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="Business Review 360" primaryColor={theme.colors.primary} />

      <Section>
        <Text style={styles.heading}>Your account is ready</Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Thank you for subscribing to Business Review 360. Your workspace for{" "}
          <strong>{organizationName}</strong>
          {planLabel ? ` (${planLabel} plan)` : ""} is now active and ready to use.
        </Text>

        <Text style={styles.paragraph}>Log in to get started:</Text>

        <Button href={loginUrl} style={styles.button}>
          Go to your workspace
        </Button>
      </Section>

      <Divider />

      <Section>
        <Text style={styles.subheading}>What you can do now</Text>
        <Text style={styles.listItem}>Invite your team members</Text>
        <Text style={styles.listItem}>
          Capture and organise business improvement ideas from across your organisation
        </Text>
        <Text style={styles.listItem}>
          Set up categories, approval workflows, and custom fields
        </Text>
        <Text style={styles.listItem}>
          Use analytics and priority matrices to focus on what matters
        </Text>
      </Section>

      <Divider />

      <Section>
        <Text style={styles.paragraph}>
          If you have any questions, reply to this email and we will get back to you promptly.
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
