import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { IdeaCard } from "../../components/IdeaCard.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * CommentOnIdea Template
 *
 * Sent when someone comments on the user's idea.
 *
 * @param {Object} props
 * @param {string} props.userName - Idea author's name (optional)
 * @param {string} props.ideaTitle - Title of the idea
 * @param {string} props.ideaUrl - URL to view the idea
 * @param {string} props.commenterName - Name of the person who commented
 * @param {string} props.commentPreview - First 150 chars of comment
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {string} props.unsubscribeUrl - URL to unsubscribe from notifications
 */
export function CommentOnIdea({
  userName = null,
  ideaTitle,
  ideaUrl,
  commenterName,
  commentPreview,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
  unsubscribeUrl = null,
}) {
  const previewText = `${commenterName} commented on your idea: ${ideaTitle}`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>New Comment on Your Idea</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          <strong>{commenterName}</strong> commented on your idea:
        </Text>

        <IdeaCard title={ideaTitle} ideaUrl={ideaUrl} primaryColor={primaryColor} />

        <Section backgroundColor={theme.colors.backgroundLight} padding="md">
          <Text style={styles.commentLabel}>Comment:</Text>
          <Text style={styles.commentText}>"{commentPreview}"</Text>
        </Section>

        <Section center padding="md">
          <Button href={ideaUrl} color={primaryColor}>
            View Comment & Reply
          </Button>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.footerNote}>
          You're receiving this email because you authored this idea.
        </Text>

        {unsubscribeUrl && (
          <Text style={styles.unsubscribe}>
            <Link href={unsubscribeUrl} style={{ color: theme.colors.textMuted }}>
              Unsubscribe from this idea
            </Link>
          </Text>
        )}
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
  commentLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  commentText: {
    fontSize: theme.typography.fontSize.base,
    fontStyle: "italic",
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.relaxed,
    margin: "0",
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  unsubscribe: {
    fontSize: theme.typography.fontSize.sm,
    textAlign: "center",
    margin: "0",
  },
};

export default CommentOnIdea;
