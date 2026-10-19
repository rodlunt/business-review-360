import { Text, Button, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * TrialReminder Template
 *
 * Sent at configurable intervals before a trial expires (e.g. 13, 7, 3, 1 day).
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin display name
 * @param {string} props.organizationId - Org slug
 * @param {string} props.organizationName - Human-readable org name
 * @param {number} props.daysRemaining - Days until trial expires
 * @param {string} props.trialEndsAt - ISO string for trial expiry
 * @param {string} props.appUrl - Base application URL
 */
export function TrialReminder({
  adminName = null,
  organizationId = null,
  organizationName = "your organisation",
  daysRemaining = 7,
  trialEndsAt = null,
  appUrl = "https://br360.example.com",
}) {
  const isUrgent = daysRemaining <= 3;
  const dayWord = daysRemaining === 1 ? "day" : "days";
  const previewText = `Your Business Review 360 trial expires in ${daysRemaining} ${dayWord}`;

  const formattedExpiry = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString("en-AU", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const upgradeUrl = `${appUrl}/pricing`;
  const loginUrl = organizationId ? `${appUrl}/org/${organizationId}/login` : appUrl;

  return (
    <EmailLayout preview={previewText}>
      <Header
        organizationName="Business Review 360"
        primaryColor={isUrgent ? theme.colors.warning : theme.colors.primary}
      />

      <Section>
        <Text style={isUrgent ? styles.headingUrgent : styles.heading}>
          Your trial expires in {daysRemaining} {dayWord}
        </Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Just a reminder that your free trial for <strong>{organizationName}</strong> expires{" "}
          {formattedExpiry ? `on ${formattedExpiry}` : `in ${daysRemaining} ${dayWord}`}.
          {isUrgent
            ? " Upgrade now to keep your data and continue without interruption."
            : " Upgrade any time before your trial ends to keep access."}
        </Text>

        <Section
          backgroundColor={isUrgent ? "#fff8e1" : theme.colors.backgroundLight}
          padding="md"
          style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
        >
          <Text style={styles.metaLabel}>Trial expires</Text>
          <Text style={isUrgent ? styles.metaValueUrgent : styles.metaValue}>
            {formattedExpiry ?? `${daysRemaining} ${dayWord} remaining`}
          </Text>
        </Section>

        <Button href={upgradeUrl} style={isUrgent ? styles.buttonUrgent : styles.button}>
          Upgrade now
        </Button>

        <Text style={styles.secondaryLink}>
          Not ready yet?{" "}
          <Link href={loginUrl} style={styles.link}>
            Continue using your trial
          </Link>
        </Text>
      </Section>

      <Divider />

      <Section>
        <Text style={styles.paragraph}>
          After your trial expires, your account will become read-only. Your data is safe and will
          be waiting for you when you upgrade.
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
  headingUrgent: {
    fontSize: "24px",
    fontWeight: "bold",
    color: theme.colors.warning,
    margin: `0 0 ${theme.spacing.md} 0`,
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
  metaValueUrgent: {
    fontSize: "16px",
    fontWeight: "600",
    color: theme.colors.warning,
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
  buttonUrgent: {
    backgroundColor: theme.colors.warning,
    color: "#ffffff",
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    borderRadius: theme.borderRadius.md,
    fontWeight: "600",
    fontSize: "16px",
    textDecoration: "none",
    display: "inline-block",
    margin: `${theme.spacing.md} 0`,
  },
  secondaryLink: {
    fontSize: "14px",
    color: theme.colors.textMuted,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  link: {
    color: theme.colors.primary,
    textDecoration: "underline",
  },
};
