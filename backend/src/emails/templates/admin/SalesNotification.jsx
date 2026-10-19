import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * SalesNotification Template
 *
 * Sent to the sales inbox when a new sales enquiry is submitted via
 * POST /api/contact/sales (see issue #344).
 *
 * Layout (issue #645 polish):
 *   1. Heading + lead paragraph
 *   2. "Enquirer details" card: company name, contact, email, phone, plan,
 *      company size, enquiry id, submitted timestamp. Each row is a
 *      labelled definition pair with consistent vertical rhythm.
 *   3. "Message" card (only when the enquirer left a message): own block
 *      with `whiteSpace: pre-wrap` so paragraph breaks survive.
 *   4. Footer note + standard layout footer.
 *
 * @param {Object} props
 * @param {number} props.enquiryId - Database record ID for the enquiry
 * @param {string} props.companyName - Submitting company name
 * @param {string} props.contactName - Name of the person making contact
 * @param {string} props.email - Reply-to email address
 * @param {string} props.phone - Phone number (optional)
 * @param {string} props.companySize - Submitted company size bracket
 * @param {string} props.planInterest - Plan of interest (e.g. enterprise)
 * @param {string} props.message - Free-text message (optional)
 * @param {string} props.submittedAt - Submission timestamp (ISO string)
 * @param {string} props.organizationName - Organisation display name
 * @param {string} props.primaryColor - Brand colour
 * @param {string} props.logoUrl - Organisation logo URL (optional)
 */
export function SalesNotification({
  enquiryId,
  companyName,
  contactName,
  email,
  phone = null,
  companySize,
  planInterest,
  message = null,
  submittedAt = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `New sales enquiry from ${companyName} (${planInterest})`;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Australia/Sydney",
    });
  };

  // Single source of truth for the field rows so the layout stays
  // consistent and easy to extend.
  const detailRows = [
    { label: "Contact", value: contactName },
    {
      label: "Email",
      value: (
        <Link href={`mailto:${email}`} style={{ color: primaryColor, textDecoration: "none" }}>
          {email}
        </Link>
      ),
    },
    { label: "Phone", value: phone || "Not provided" },
    { label: "Plan interest", value: planInterest },
    { label: "Company size", value: companySize },
    { label: "Enquiry ID", value: `#${enquiryId}` },
    submittedAt ? { label: "Submitted", value: formatDate(submittedAt) } : null,
  ].filter(Boolean);

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>New sales enquiry</Text>
        <Text style={styles.leadParagraph}>
          A new sales enquiry has been submitted via the website. Please follow up within 24 hours.
        </Text>

        {/* Enquirer details card */}
        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="md"
          style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
        >
          <Text style={{ ...styles.companyTitle, color: primaryColor }}>{companyName}</Text>

          <table style={styles.detailTable} cellPadding="0" cellSpacing="0" role="presentation">
            <tbody>
              {detailRows.map((row, idx) => {
                const isLast = idx === detailRows.length - 1;
                return (
                  <tr key={row.label}>
                    <td style={{ ...styles.labelCell, ...(isLast ? styles.lastCell : null) }}>
                      <Text style={styles.label}>{row.label}</Text>
                    </td>
                    <td style={{ ...styles.valueCell, ...(isLast ? styles.lastCell : null) }}>
                      <Text style={styles.value}>{row.value}</Text>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* Message card (own block so long-form text breathes) */}
        {message && (
          <Section
            backgroundColor={theme.colors.backgroundWhite}
            padding="md"
            style={{
              borderRadius: theme.borderRadius.lg,
              border: `1px solid ${theme.colors.borderLight}`,
              marginTop: theme.spacing.md,
            }}
          >
            <Text style={styles.label}>Message</Text>
            <Text style={styles.messageText}>{message}</Text>
          </Section>
        )}

        <Divider margin="lg" />

        <Text style={styles.footerNote}>
          This notification was generated automatically from the BR360 sales form.
        </Text>
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
    margin: `0 0 ${theme.spacing.sm} 0`,
    lineHeight: theme.typography.lineHeight.tight,
  },
  leadParagraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  companyTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    margin: `0 0 ${theme.spacing.md} 0`,
    lineHeight: theme.typography.lineHeight.tight,
  },
  detailTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  labelCell: {
    width: "35%",
    padding: `${theme.spacing.sm} ${theme.spacing.sm} ${theme.spacing.sm} 0`,
    verticalAlign: "top",
    borderBottom: `1px solid ${theme.colors.borderLight}`,
  },
  valueCell: {
    width: "65%",
    padding: `${theme.spacing.sm} 0`,
    verticalAlign: "top",
    borderBottom: `1px solid ${theme.colors.borderLight}`,
  },
  lastCell: {
    borderBottom: "none",
  },
  label: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0",
    lineHeight: theme.typography.lineHeight.normal,
  },
  value: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: "0",
    lineHeight: theme.typography.lineHeight.normal,
    wordBreak: "break-word",
  },
  messageText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.relaxed,
    margin: `${theme.spacing.xs} 0 0 0`,
    whiteSpace: "pre-wrap",
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: "0",
  },
};

export default SalesNotification;
