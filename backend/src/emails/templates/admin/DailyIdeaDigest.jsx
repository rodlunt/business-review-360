import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * DailyIdeaDigest Template
 *
 * Daily/hourly digest of new ideas submitted (for admins who prefer batched notifications).
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin's name (optional)
 * @param {Array} props.ideas - Array of new ideas
 * @param {string} props.ideas[].title - Idea title
 * @param {string} props.ideas[].url - URL to the idea
 * @param {string} props.ideas[].authorName - Author's name
 * @param {string} props.ideas[].category - Idea category (optional)
 * @param {string} props.ideas[].priority - Idea priority (optional)
 * @param {number} props.ideas[].timeSavedMinutes - Est. time saved (optional)
 * @param {string} props.digestPeriod - Period description ('today', 'this hour', 'this week')
 * @param {string} props.allIdeasUrl - URL to view all ideas
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function DailyIdeaDigest({
  adminName = null,
  ideas = [],
  digestPeriod = "today",
  allIdeasUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const count = ideas.length;
  const previewText = `${count} new idea${count !== 1 ? "s" : ""} submitted ${digestPeriod} - ${organizationName}`;

  // Format time saved
  const formatTimeSaved = (minutes) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Get priority badge style
  const getPriorityStyle = (priority) => {
    const styles = {
      High: { backgroundColor: "#ffebee", color: theme.colors.error },
      Medium: { backgroundColor: "#fff3e0", color: theme.colors.warning },
      Low: { backgroundColor: "#f5f5f5", color: theme.colors.textSecondary },
    };
    return styles[priority] || styles["Low"];
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>
          {count} New Idea{count !== 1 ? "s" : ""}{" "}
          {digestPeriod.charAt(0).toUpperCase() + digestPeriod.slice(1)}
        </Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          Here's a summary of new ideas submitted {digestPeriod}:
        </Text>

        {/* Ideas List */}
        {ideas.map((idea, index) => (
          <Section
            key={index}
            backgroundColor={theme.colors.backgroundLight}
            padding="md"
            style={{
              borderRadius: theme.borderRadius.lg,
              marginBottom: theme.spacing.md,
            }}
          >
            <table style={styles.ideaTable} cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  <td style={styles.ideaNumber}>
                    <Text style={{ ...styles.numberBadge, backgroundColor: primaryColor }}>
                      {index + 1}
                    </Text>
                  </td>
                  <td style={styles.ideaContent}>
                    <Link href={idea.url} style={{ ...styles.ideaTitle, color: primaryColor }}>
                      {idea.title}
                    </Link>
                    <Text style={styles.ideaMeta}>
                      By <strong>{idea.authorName}</strong>
                    </Text>

                    {/* Tags Row */}
                    <table style={styles.tagsTable} cellPadding="0" cellSpacing="0">
                      <tbody>
                        <tr>
                          {idea.category && (
                            <td style={styles.tagCell}>
                              <Text style={styles.categoryTag}>{idea.category}</Text>
                            </td>
                          )}
                          {idea.priority && (
                            <td style={styles.tagCell}>
                              <Text
                                style={{
                                  ...styles.priorityTag,
                                  ...getPriorityStyle(idea.priority),
                                }}
                              >
                                {idea.priority}
                              </Text>
                            </td>
                          )}
                          {idea.timeSavedMinutes && (
                            <td style={styles.tagCell}>
                              <Text style={styles.timeSavedTag}>
                                {formatTimeSaved(idea.timeSavedMinutes)} saved
                              </Text>
                            </td>
                          )}
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  <td style={styles.ideaAction}>
                    <Link href={idea.url} style={{ ...styles.viewLink, color: primaryColor }}>
                      View
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
        ))}

        {/* Summary */}
        {ideas.length > 0 && (
          <Section
            backgroundColor={theme.colors.backgroundWhite}
            padding="sm"
            style={{ textAlign: "center", marginTop: theme.spacing.md }}
          >
            <Text style={styles.summaryText}>
              {ideas.filter((i) => i.priority === "High").length > 0 && (
                <span>
                  <strong>{ideas.filter((i) => i.priority === "High").length}</strong> high priority
                  |{" "}
                </span>
              )}
              {ideas.filter((i) => i.timeSavedMinutes).length > 0 && (
                <span>
                  <strong>
                    {formatTimeSaved(ideas.reduce((sum, i) => sum + (i.timeSavedMinutes || 0), 0))}
                  </strong>{" "}
                  potential time savings
                </span>
              )}
            </Text>
          </Section>
        )}

        <Section center padding="md">
          <Button href={allIdeasUrl} color={primaryColor}>
            View All Ideas
          </Button>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.footerNote}>
          This is your{" "}
          {digestPeriod === "this hour"
            ? "hourly"
            : digestPeriod === "this week"
              ? "weekly"
              : "daily"}{" "}
          idea digest. You're receiving this because you're an admin of {organizationName}.
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
  ideaNumber: {
    width: "40px",
    verticalAlign: "top",
    paddingRight: theme.spacing.sm,
  },
  numberBadge: {
    color: "#ffffff",
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    width: "28px",
    height: "28px",
    lineHeight: "28px",
    textAlign: "center",
    borderRadius: theme.borderRadius.full,
    margin: "0",
  },
  ideaContent: {
    verticalAlign: "top",
  },
  ideaAction: {
    verticalAlign: "middle",
    textAlign: "right",
    width: "60px",
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
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  tagsTable: {
    marginTop: theme.spacing.xs,
  },
  tagCell: {
    paddingRight: theme.spacing.sm,
  },
  categoryTag: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    backgroundColor: theme.colors.backgroundWhite,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    margin: "0",
    display: "inline-block",
  },
  priorityTag: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    margin: "0",
    display: "inline-block",
  },
  timeSavedTag: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.success,
    backgroundColor: "#e8f5e9",
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    margin: "0",
    display: "inline-block",
  },
  viewLink: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecoration: "none",
  },
  summaryText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: "0",
  },
};

export default DailyIdeaDigest;
