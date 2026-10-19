import { Text, Row, Column } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * ConsultantMonthlyStatementEmail
 *
 * Sent once per consultant at the end of each commission run.
 * Summarises active referred subscriptions and the commission owing.
 *
 * Issue #808 Phase 3.
 *
 * @param {Object}   props
 * @param {string}   props.firstName           - Consultant's first name
 * @param {string}   props.monthLabel          - Human-readable period, e.g. "May 2026"
 * @param {Array}    props.lineItems           - Array of { orgName, grossCents, commissionCents }
 * @param {number}   props.totalCommissionCents - Total commission owing in cents
 * @param {string}   props.currency            - Currency code, e.g. "AUD"
 */
export function ConsultantMonthlyStatementEmail({
  firstName = "there",
  monthLabel = "this month",
  lineItems = [],
  totalCommissionCents = 0,
  currency = "AUD",
}) {
  const previewText = `Your BR360 commission statement for ${monthLabel}`;
  const currencyUpper = currency.toUpperCase();

  function formatDollars(cents) {
    return `$${(cents / 100).toFixed(2)} ${currencyUpper}`;
  }

  const hasActiveOrgs = lineItems.length > 0;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="BusinessReview360" primaryColor={theme.colors.primary} />

      <Section>
        <Text style={styles.heading}>Your BR360 commission statement</Text>
        <Text style={styles.paragraph}>Hi {firstName},</Text>
        <Text style={styles.paragraph}>Here is your commission summary for {monthLabel}.</Text>

        {hasActiveOrgs ? (
          <>
            {/* Header row */}
            <Row style={styles.tableHeaderRow}>
              <Column style={styles.colOrg}>Organisation</Column>
              <Column style={styles.colAmount}>Gross subscription</Column>
              <Column style={styles.colAmount}>Your commission (30%)</Column>
            </Row>

            {lineItems.map((item, i) => (
              <Row key={i} style={i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}>
                <Column style={styles.colOrg}>{item.orgName}</Column>
                <Column style={styles.colAmount}>{formatDollars(item.grossCents)}</Column>
                <Column style={styles.colAmount}>{formatDollars(item.commissionCents)}</Column>
              </Row>
            ))}

            <Divider margin="md" />

            <Text style={styles.totalLine}>Total: {formatDollars(totalCommissionCents)}</Text>

            <Text style={styles.paragraph}>
              Please send an invoice for the above amount to{" "}
              <a href="mailto:hello@br360.example.com" style={styles.link}>
                hello@br360.example.com
              </a>
              .
            </Text>
          </>
        ) : (
          <Text style={styles.paragraph}>No active referred subscriptions this month.</Text>
        )}

        <Text style={styles.paragraph}>
          Questions? Reply to this email and we will get back to you.
        </Text>
      </Section>

      <Footer organizationName="BusinessReview360" showUnsubscribe={false} />
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
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  tableHeaderRow: {
    backgroundColor: theme.colors.primary,
    color: "#ffffff",
    fontWeight: theme.typography.fontWeight.bold,
    fontSize: theme.typography.fontSize.sm,
    padding: "8px 0",
  },
  tableRowEven: {
    backgroundColor: "#f9f9f9",
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    padding: "6px 0",
  },
  tableRowOdd: {
    backgroundColor: "#ffffff",
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    padding: "6px 0",
  },
  colOrg: {
    width: "50%",
    paddingLeft: "8px",
  },
  colAmount: {
    width: "25%",
    textAlign: "right",
    paddingRight: "8px",
  },
  totalLine: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
    textAlign: "right",
  },
  link: {
    color: theme.colors.primary,
  },
};

export default ConsultantMonthlyStatementEmail;
