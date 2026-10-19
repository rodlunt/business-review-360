import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Section } from "../../components/Section.jsx";
import { theme } from "../../styles/theme.js";

/**
 * DemoLeadCapture Template (#566)
 *
 * Sent to LEAD_CAPTURE_EMAIL when a visitor starts the demo and provides
 * their email address. Surfaces the lead in the sales inbox immediately.
 */
export function DemoLeadCapture({
  visitorEmail,
  submittedAt = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
}) {
  const previewText = `New demo lead: ${visitorEmail}`;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Australia/Sydney",
    });
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} />

      <Section>
        <Text style={styles.heading}>New demo lead</Text>
        <Text style={styles.body}>
          A visitor has started the demo with an email address. Follow up within 24 hours to
          maximise conversion.
        </Text>

        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="md"
          style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
        >
          <table style={styles.table} cellPadding="0" cellSpacing="0" role="presentation">
            <tbody>
              <tr>
                <td style={styles.labelCell}>
                  <Text style={styles.label}>Email</Text>
                </td>
                <td style={styles.valueCell}>
                  <Text style={styles.value}>
                    <Link href={`mailto:${visitorEmail}`} style={{ color: primaryColor }}>
                      {visitorEmail}
                    </Link>
                  </Text>
                </td>
              </tr>
              {submittedAt && (
                <tr>
                  <td style={{ ...styles.labelCell, borderBottom: "none" }}>
                    <Text style={styles.label}>Started demo</Text>
                  </td>
                  <td style={{ ...styles.valueCell, borderBottom: "none" }}>
                    <Text style={styles.value}>{formatDate(submittedAt)}</Text>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
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
  },
  body: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeight.normal,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  table: { width: "100%", borderCollapse: "collapse" },
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
  label: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0",
  },
  value: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: "0",
  },
};

export default DemoLeadCapture;
