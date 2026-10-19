import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * IdeasNeedAttention Template
 *
 * Weekly digest sent to admins with ideas that have been in review too long.
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin's name (optional)
 * @param {Array} props.staleIdeas - Array of stale ideas
 * @param {string} props.staleIdeas[].title - Idea title
 * @param {string} props.staleIdeas[].url - URL to the idea
 * @param {number} props.staleIdeas[].daysInReview - Days since submission/last update
 * @param {string} props.staleIdeas[].authorName - Author's name
 * @param {number} props.staleIdeas[].commentCount - Number of comments
 * @param {string} props.staleIdeas[].category - Idea category (optional)
 * @param {number} props.threshold - Days threshold for stale (default: 14)
 * @param {string} props.allIdeasUrl - URL to view all pending ideas
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function IdeasNeedAttention({
  adminName = null,
  staleIdeas = [],
  threshold = 14,
  allIdeasUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const count = staleIdeas.length;
  const previewText = `${count} idea${count !== 1 ? "s" : ""} need${count === 1 ? "s" : ""} your attention - ${organizationName}`;

  // Get urgency color based on days in review
  const getUrgencyColor = (days) => {
    if (days >= 30) return theme.colors.error;
    if (days >= 21) return theme.colors.warning;
    return theme.colors.textSecondary;
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>
          {count} Idea{count !== 1 ? "s" : ""} Need{count === 1 ? "s" : ""} Your Attention
        </Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          The following ideas have been in review for {threshold}+ days and may need your attention:
        </Text>

        {/* Stale Ideas List */}
        {staleIdeas.map((idea, index) => (
          <Section
            key={index}
            backgroundColor={theme.colors.backgroundLight}
            padding="md"
            style={{
              borderRadius: theme.borderRadius.lg,
              marginBottom: theme.spacing.md,
              borderLeft: `4px solid ${getUrgencyColor(idea.daysInReview)}`,
            }}
          >
            <table style={styles.ideaTable} cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  <td style={styles.ideaContent}>
                    <Link href={idea.url} style={{ ...styles.ideaTitle, color: primaryColor }}>
                      {idea.title}
                    </Link>
                    <Text style={styles.ideaMeta}>
                      <span
                        style={{ color: getUrgencyColor(idea.daysInReview), fontWeight: "bold" }}
                      >
                        {idea.daysInReview} days
                      </span>
                      {" in review | By "}
                      <strong>{idea.authorName}</strong>
                      {idea.commentCount > 0 && (
                        <span>
                          {" "}
                          | {idea.commentCount} comment{idea.commentCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </Text>
                    {idea.category && <Text style={styles.ideaCategory}>{idea.category}</Text>}
                  </td>
                  <td style={styles.ideaAction}>
                    <Link href={idea.url} style={{ ...styles.reviewLink, color: primaryColor }}>
                      Review &rarr;
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
        ))}

        {/* Summary Stats */}
        {count > 3 && (
          <Section
            backgroundColor={theme.colors.backgroundWhite}
            padding="sm"
            style={{ textAlign: "center" }}
          >
            <Text style={styles.summaryText}>
              Oldest: <strong>{Math.max(...staleIdeas.map((i) => i.daysInReview))} days</strong> |
              Average:{" "}
              <strong>
                {Math.round(staleIdeas.reduce((sum, i) => sum + i.daysInReview, 0) / count)} days
              </strong>
            </Text>
          </Section>
        )}

        <Section center padding="md">
          <Button href={allIdeasUrl} color={primaryColor}>
            View All Pending Ideas
          </Button>
        </Section>

        <Divider margin="lg" />

        {/* Tips Section */}
        <Section backgroundColor={theme.colors.backgroundLight} padding="md">
          <Text style={styles.tipsHeading}>Quick Actions You Can Take:</Text>
          <Text style={styles.tipItem}>
            <strong>Approve</strong> - If the idea is valuable and ready to implement
          </Text>
          <Text style={styles.tipItem}>
            <strong>Comment</strong> - Ask for more details or clarification
          </Text>
          <Text style={styles.tipItem}>
            <strong>Reject</strong> - If it doesn't fit current priorities (with explanation)
          </Text>
          <Text style={styles.tipItem}>
            <strong>Change Status</strong> - Move to "In Progress" or "Planned"
          </Text>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.footerNote}>
          This digest is sent weekly. You're receiving this because you're an admin of{" "}
          {organizationName}.
        </Text>
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
  ideaTable: {
    width: "100%",
  },
  ideaContent: {
    verticalAlign: "top",
  },
  ideaAction: {
    verticalAlign: "middle",
    textAlign: "right",
    width: "80px",
  },
  ideaTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecoration: "none",
    display: "block",
    marginBottom: theme.spacing.xs,
  },
  ideaMeta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  ideaCategory: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    backgroundColor: theme.colors.backgroundWhite,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    display: "inline-block",
    margin: "0",
  },
  reviewLink: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecoration: "none",
  },
  summaryText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  tipsHeading: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  tipItem: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.xs} 0`,
    paddingLeft: theme.spacing.sm,
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: "0",
  },
};

export default IdeasNeedAttention;
