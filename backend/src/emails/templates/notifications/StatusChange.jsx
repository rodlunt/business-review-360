import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { IdeaCard } from "../../components/IdeaCard.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme, getStatusStyle } from "../../styles/theme.js";

/**
 * StatusChange Template
 *
 * Sent when an admin changes the status of the user's idea.
 *
 * @param {Object} props
 * @param {string} props.userName - Idea author's name (optional)
 * @param {string} props.ideaTitle - Title of the idea
 * @param {string} props.ideaUrl - URL to view the idea
 * @param {string} props.oldStatus - Previous status
 * @param {string} props.newStatus - New status
 * @param {string} props.adminName - Name of the admin who changed status (optional)
 * @param {string} props.adminComments - Admin's comments about the change (optional)
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function StatusChange({
  userName = null,
  ideaTitle,
  ideaUrl,
  oldStatus,
  newStatus,
  adminName = null,
  adminComments = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `Your idea status changed: ${ideaTitle} is now ${newStatus}`;
  const oldStatusStyle = getStatusStyle(oldStatus);
  const newStatusStyle = getStatusStyle(newStatus);

  // Determine message tone based on new status
  const getMessage = () => {
    switch (newStatus.toLowerCase()) {
      case "approved":
        return "Great news! Your idea has been approved and is moving forward.";
      case "implemented":
        return "Congratulations! Your idea has been implemented!";
      case "rejected":
        return "Thank you for your submission. Unfortunately, we won't be moving forward with this idea at this time.";
      case "reviewing":
        return "Your idea is now being reviewed by our team.";
      default:
        return `Your idea status has been updated to ${newStatus}.`;
    }
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>Your Idea Status Changed</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        {/* Status change badge display */}
        <Section center padding="md">
          <Text style={styles.statusRow}>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: oldStatusStyle.bg,
                color: oldStatusStyle.text,
                border: `1px solid ${oldStatusStyle.border}`,
              }}
            >
              {oldStatus}
            </span>
            <span style={styles.arrow}> → </span>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: newStatusStyle.bg,
                color: newStatusStyle.text,
                border: `1px solid ${newStatusStyle.border}`,
              }}
            >
              {newStatus}
            </span>
          </Text>
        </Section>

        <IdeaCard
          title={ideaTitle}
          status={newStatus}
          ideaUrl={ideaUrl}
          primaryColor={primaryColor}
        />

        <Text style={styles.message}>{getMessage()}</Text>

        {adminComments && (
          <>
            <Divider margin="md" />
            <Text style={styles.commentLabel}>
              {adminName ? `Comments from ${adminName}:` : "Admin comments:"}
            </Text>
            <Section backgroundColor={theme.colors.backgroundLight} padding="md">
              <Text style={styles.commentText}>"{adminComments}"</Text>
            </Section>
          </>
        )}

        <Section center padding="md">
          <Button href={ideaUrl} color={primaryColor}>
            View Idea
          </Button>
        </Section>
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
  statusRow: {
    fontSize: theme.typography.fontSize.base,
    textAlign: "center",
    margin: "0",
  },
  statusBadge: {
    display: "inline-block",
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    borderRadius: theme.borderRadius.md,
    textTransform: "uppercase",
  },
  arrow: {
    fontSize: theme.typography.fontSize.xl,
    color: theme.colors.textSecondary,
    margin: `0 ${theme.spacing.sm}`,
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    textAlign: "center",
    margin: `${theme.spacing.md} 0`,
  },
  commentLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  commentText: {
    fontSize: theme.typography.fontSize.base,
    fontStyle: "italic",
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.relaxed,
    margin: "0",
  },
};

export default StatusChange;
