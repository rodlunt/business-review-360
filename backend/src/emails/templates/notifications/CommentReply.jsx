import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * CommentReply Template
 *
 * Sent when someone replies to the user's comment.
 *
 * @param {Object} props
 * @param {string} props.userName - Original commenter's name (optional)
 * @param {string} props.ideaTitle - Title of the idea
 * @param {string} props.ideaUrl - URL to view the idea and comments
 * @param {string} props.replyAuthorName - Name of the person who replied
 * @param {string} props.replyPreview - Preview of the reply (first 150 chars)
 * @param {string} props.originalCommentPreview - Preview of the original comment for context
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {string} props.unsubscribeUrl - URL to unsubscribe from this thread (optional)
 */
export function CommentReply({
  userName = null,
  ideaTitle,
  ideaUrl,
  replyAuthorName,
  replyPreview,
  originalCommentPreview = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
  unsubscribeUrl = null,
}) {
  const previewText = `${replyAuthorName} replied to your comment on: ${ideaTitle}`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>Reply to Your Comment</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          <strong>{replyAuthorName}</strong> replied to your comment on the idea:
        </Text>

        <Text style={styles.ideaTitle}>
          <Link href={ideaUrl} style={{ color: primaryColor }}>
            {ideaTitle}
          </Link>
        </Text>

        {/* Original comment context */}
        {originalCommentPreview && (
          <Section backgroundColor={theme.colors.backgroundLight} padding="sm">
            <Text style={styles.contextLabel}>Your comment:</Text>
            <Text style={styles.originalComment}>"{originalCommentPreview}"</Text>
          </Section>
        )}

        {/* Reply */}
        <Section
          backgroundColor={theme.colors.backgroundWhite}
          padding="md"
          style={{ border: `2px solid ${primaryColor}`, borderRadius: theme.borderRadius.lg }}
        >
          <Text style={styles.replyLabel}>{replyAuthorName} replied:</Text>
          <Text style={styles.replyText}>"{replyPreview}"</Text>
        </Section>

        <Section center padding="md">
          <Button href={ideaUrl} color={primaryColor}>
            View & Reply
          </Button>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.footerNote}>
          You're receiving this email because you commented on this idea.
        </Text>

        {unsubscribeUrl && (
          <Text style={styles.unsubscribe}>
            <Link href={unsubscribeUrl} style={{ color: theme.colors.textMuted }}>
              Unsubscribe from this thread
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
  ideaTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  contextLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  originalComment: {
    fontSize: theme.typography.fontSize.sm,
    fontStyle: "italic",
    color: theme.colors.textSecondary,
    margin: "0",
  },
  replyLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  replyText: {
    fontSize: theme.typography.fontSize.base,
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

export default CommentReply;
