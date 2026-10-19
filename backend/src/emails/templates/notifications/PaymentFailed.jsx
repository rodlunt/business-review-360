import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { Button } from "../../components/Button.jsx";
import { theme } from "../../styles/theme.js";

/**
 * PaymentFailed Template
 *
 * Sent to a customer when their Stripe subscription payment has failed
 * (invoice.payment_failed webhook).
 *
 * Stripe automatically retries failed invoices according to the configured
 * retry schedule on the Stripe dashboard (Smart Retries / dunning settings).
 * To avoid spamming the customer once per retry, the calling site should
 * only dispatch this template on the FIRST failed attempt for a given
 * invoice (i.e. invoice.attempt_count === 1) and log subsequent retries
 * without sending. The copy below is therefore written as a single
 * "your payment failed, please update your payment method" notice and
 * deliberately does not promise specific retry timing -- Stripe controls
 * that, not BR360.
 *
 * @param {Object} props
 * @param {string} props.customerName - Customer display name (optional)
 * @param {string} props.customerEmail - Customer email (shown in summary)
 * @param {string} props.planName - Plan affected by the failed payment
 * @param {string} props.retryDate - ISO string for the next Stripe retry attempt (optional)
 * @param {string} props.portalUrl - Stripe Customer Portal URL to update payment method
 * @param {string} props.supportEmail - Support contact address
 * @param {string} props.organizationName - Organisation display name
 * @param {string} props.primaryColor - Brand colour
 * @param {string} props.logoUrl - Organisation logo URL (optional)
 */
export function PaymentFailed({
  customerName = null,
  customerEmail = null,
  planName = null,
  retryDate = null,
  portalUrl = null,
  supportEmail = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `Action required: your ${organizationName} payment failed`;

  const formattedRetryDate = retryDate
    ? new Date(retryDate).toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>Payment Failed</Text>

        <Text style={styles.paragraph}>{customerName ? `Hi ${customerName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Your most recent payment for {organizationName}
          {planName ? ` (${planName})` : ""} could not be processed. This can happen when a card has
          expired, the bank declines the charge, or there are insufficient funds.
        </Text>

        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="md"
          style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
        >
          {planName && (
            <>
              <Text style={styles.metaLabel}>Plan</Text>
              <Text style={styles.metaValue}>{planName}</Text>
            </>
          )}

          {formattedRetryDate && (
            <>
              <Text style={{ ...styles.metaLabel, marginTop: theme.spacing.sm }}>
                Next Automatic Retry
              </Text>
              <Text style={styles.metaValue}>{formattedRetryDate}</Text>
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
          Stripe will automatically retry the payment a few times in line with our retry schedule.
          To resolve this immediately, please update your payment method using the link below.
        </Text>

        {portalUrl && (
          <Section style={{ textAlign: "center", margin: `${theme.spacing.lg} 0` }}>
            <Button href={portalUrl} variant="primary" color={primaryColor}>
              Update Payment Method
            </Button>
          </Section>
        )}

        <Text style={styles.paragraph}>
          Once a payment succeeds your account is restored automatically. If all retries fail your
          subscription may be paused until the balance is settled.
        </Text>

        {supportEmail && (
          <Text style={styles.paragraph}>
            Need a hand? Contact support:{" "}
            <Link href={`mailto:${supportEmail}`} style={{ color: primaryColor }}>
              {supportEmail}
            </Link>
          </Text>
        )}

        <Divider margin="lg" />

        <Text style={styles.footerNote}>This is an automated notice from {organizationName}.</Text>
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

export default PaymentFailed;
