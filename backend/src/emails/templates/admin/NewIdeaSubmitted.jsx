import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * NewIdeaSubmitted Template
 *
 * Sent to admins when a new idea is submitted.
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin's name (optional)
 * @param {string} props.ideaTitle - Title of the new idea
 * @param {string} props.ideaDescription - Description preview (first 200 chars)
 * @param {string} props.ideaUrl - URL to view/review the idea
 * @param {string} props.authorName - Name of the idea author
 * @param {string} props.category - Idea category (optional)
 * @param {string} props.priority - Idea priority (optional)
 * @param {number} props.timeSavedMinutes - Estimated time saved (optional)
 * @param {number} props.impactScore - Impact score 1-10 (optional)
 * @param {number} props.effortScore - Effort score 1-10 (optional)
 * @param {string} props.submittedAt - Submission timestamp
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function NewIdeaSubmitted({
  adminName = null,
  ideaTitle,
  ideaDescription,
  ideaUrl,
  authorName,
  category = null,
  priority = null,
  timeSavedMinutes = null,
  impactScore = null,
  effortScore = null,
  submittedAt = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `New idea submitted: ${ideaTitle} by ${authorName}`;

  // Format time saved
  const formatTimeSaved = (minutes) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Format submission date
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-AU", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Australia/Sydney",
    });
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>New Idea Submitted</Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          A new idea has been submitted and is ready for your review.
        </Text>

        {/* Idea Card */}
        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="md"
          style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
        >
          <Text style={{ ...styles.ideaTitle, color: primaryColor }}>{ideaTitle}</Text>

          <Text style={styles.authorLine}>
            Submitted by <strong>{authorName}</strong>
            {submittedAt && <span style={styles.dateText}> on {formatDate(submittedAt)}</span>}
          </Text>

          {/* Metadata Row */}
          <table style={styles.metaTable} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                {category && (
                  <td style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Category</Text>
                    <Text style={styles.metaValue}>{category}</Text>
                  </td>
                )}
                {priority && (
                  <td style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Priority</Text>
                    <Text style={{ ...styles.metaValue, ...getPriorityStyle(priority) }}>
                      {priority}
                    </Text>
                  </td>
                )}
                {timeSavedMinutes && (
                  <td style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Est. Time Saved</Text>
                    <Text style={styles.metaValue}>{formatTimeSaved(timeSavedMinutes)}</Text>
                  </td>
                )}
              </tr>
            </tbody>
          </table>

          {/* Impact/Effort Scores */}
          {(impactScore || effortScore) && (
            <table
              style={{ ...styles.metaTable, marginTop: theme.spacing.sm }}
              cellPadding="0"
              cellSpacing="0"
            >
              <tbody>
                <tr>
                  {impactScore && (
                    <td style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Impact Score</Text>
                      <Text style={styles.metaValue}>{impactScore}/10</Text>
                    </td>
                  )}
                  {effortScore && (
                    <td style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Effort Score</Text>
                      <Text style={styles.metaValue}>{effortScore}/10</Text>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          )}

          <Divider margin="sm" />

          {/* Description Preview */}
          <Text style={styles.descriptionLabel}>Description:</Text>
          <Text style={styles.description}>
            "{ideaDescription?.substring(0, 200)}
            {ideaDescription?.length > 200 ? "..." : ""}"
          </Text>
        </Section>

        <Section center padding="md">
          <Button href={ideaUrl} color={primaryColor}>
            Review Idea
          </Button>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.footerNote}>
          You're receiving this email because you're an admin of {organizationName}.
        </Text>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

function getPriorityStyle(priority) {
  const priorityColors = {
    High: { color: theme.colors.error },
    Medium: { color: theme.colors.warning },
    Low: { color: theme.colors.textSecondary },
  };
  return priorityColors[priority] || {};
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
  ideaTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  authorLine: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  dateText: {
    color: theme.colors.textMuted,
  },
  metaTable: {
    width: "100%",
  },
  metaCell: {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    verticalAlign: "top",
  },
  metaLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  metaValue: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: "0",
  },
  descriptionLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    fontStyle: "italic",
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeight.relaxed,
    margin: "0",
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: "0",
  },
};

export default NewIdeaSubmitted;
