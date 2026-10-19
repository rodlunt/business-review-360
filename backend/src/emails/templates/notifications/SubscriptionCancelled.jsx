import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * SubscriptionCancelled Template
 *
 * Sent to a customer when their Stripe subscription has been cancelled
 * (customer.subscription.deleted webhook). Confirms the cancellation,
 * names the effective date, and points to support if the cancellation
 * was unexpected.
 *
 * @param {Object} props
 * @param {string} props.customerName - Customer display name (optional)
 * @param {string} props.customerEmail - Customer email (shown in confirmation)
 * @param {string} props.planName - Plan that was cancelled
 * @param {string} props.effectiveDate - ISO string for when access ends
 * @param {string} props.supportEmail - Support contact address
 * @param {string} props.organizationName - Organisation display name
 * @param {string} props.primaryColor - Brand colour
 * @param {string} props.logoUrl - Organisation logo URL (optional)
 */
export function SubscriptionCancelled({
  customerName = null,
  customerEmail = null,
  planName = null,
  effectiveDate = null,
  supportEmail = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `Your ${organizationName} subscription has been cancelled`;

  const formattedDate = effectiveDate
    ? new Date(effectiveDate).toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>Subscription Cancelled</Text>

        <Text style={styles.paragraph}>{customerName ? `Hi ${customerName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          We're confirming that your {organizationName} subscription has been cancelled. We're sorry
          to see you go.
        </Text>

        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="md"
          style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
        >
          {planName && (
            <>
              <Text style={styles.metaLabel}>Plan Cancelled</Text>
              <Text style={styles.metaValue}>{planName}</Text>
            </>
          )}

          {formattedDate && (
            <>
              <Text style={{ ...styles.metaLabel, marginTop: theme.spacing.sm }}>Access Ends</Text>
              <Text style={styles.metaValue}>{formattedDate}</Text>
            </>
          )}

          {customerEmail && (
            <>
              <Text style={{ ...styles.metaLabel, marginTop: theme.spacing.sm }}>Account</Text>
              <Text style={styles.metaValue}>{customerEmail}</Text>
            </>
          )}
        </Section>

        <Divider margin="lg" />

        <Text style={styles.paragraph}>
          You will not be charged again. Any data associated with your account will be retained in
          line with our data retention policy.
        </Text>

        <Text style={styles.paragraph}>
          If this cancellation was unexpected, or you'd like to reactivate your subscription, please
          get in touch and we'll help you sort it out.
        </Text>

        {supportEmail && (
          <Text style={styles.paragraph}>
            Contact support:{" "}
            <Link href={`mailto:${supportEmail}`} style={{ color: primaryColor }}>
              {supportEmail}
            </Link>
          </Text>
        )}

        <Divider margin="lg" />

        <Text style={styles.footerNote}>Thanks for trying {organizationName}.</Text>
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
  metaLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  metaValue: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: "0",
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: "0",
  },
};

export default SubscriptionCancelled;
