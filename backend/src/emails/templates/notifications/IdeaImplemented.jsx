import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { IdeaCard } from "../../components/IdeaCard.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * IdeaImplemented Template
 *
 * Sent when a user's idea is marked as implemented. Celebratory email!
 *
 * @param {Object} props
 * @param {string} props.userName - Idea author's name (optional)
 * @param {string} props.ideaTitle - Title of the idea
 * @param {string} props.ideaUrl - URL to view the idea
 * @param {number} props.timeSavedMinutes - Time saved per instance (optional)
 * @param {string} props.implementationDate - Date of implementation (optional)
 * @param {string} props.adminComments - Admin's comments about implementation (optional)
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.organizationId - Organization ID for submit link
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function IdeaImplemented({
  userName = null,
  ideaTitle,
  ideaUrl,
  timeSavedMinutes = null,
  implementationDate = null,
  adminComments = null,
  organizationName = "Business Review 360",
  organizationId,
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `Your idea was implemented: ${ideaTitle}`;
  const formattedDate = implementationDate
    ? new Date(implementationDate).toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Australia/Sydney",
      })
    : null;

  const submitIdeaUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/org/${organizationId}/ideas/new`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.celebration}>🎉</Text>

        <Text style={styles.heading}>Congratulations!</Text>
        <Text style={styles.subheading}>Your Idea Was Implemented</Text>

        <Text style={styles.paragraph}>{userName ? `Hi ${userName},` : "Hello,"}</Text>

        <Text style={styles.paragraph}>
          We're thrilled to let you know that your idea has been implemented! Thank you for
          contributing to making {organizationName} better.
        </Text>

        <IdeaCard
          title={ideaTitle}
          status="Implemented"
          ideaUrl={ideaUrl}
          primaryColor={primaryColor}
        />

        {/* Impact Section */}
        {(timeSavedMinutes || formattedDate) && (
          <Section backgroundColor={theme.colors.backgroundLight} padding="md">
            <Text style={styles.impactHeading}>Impact</Text>
            {timeSavedMinutes && (
              <Text style={styles.impactItem}>
                ⏱️ Saves <strong>{timeSavedMinutes} minutes</strong> per instance
              </Text>
            )}
            {formattedDate && (
              <Text style={styles.impactItem}>
                📅 Implemented on <strong>{formattedDate}</strong>
              </Text>
            )}
          </Section>
        )}

        {adminComments && (
          <>
            <Divider margin="md" />
            <Text style={styles.commentLabel}>Implementation Details:</Text>
            <Section backgroundColor={theme.colors.backgroundLight} padding="md">
              <Text style={styles.commentText}>"{adminComments}"</Text>
            </Section>
          </>
        )}

        <Divider margin="lg" />

        <Text style={styles.thankYou}>Your ideas make a real difference. Keep them coming!</Text>

        <Section center padding="md">
          <Button href={ideaUrl} color={primaryColor}>
            View Implementation Details
          </Button>
        </Section>

        <Section center padding="sm">
          <Button href={submitIdeaUrl} variant="outline" color={primaryColor}>
            Submit Another Idea
          </Button>
        </Section>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  celebration: {
    fontSize: "64px",
    textAlign: "center",
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  heading: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: "center",
    margin: "0",
  },
  subheading: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary,
    textAlign: "center",
    margin: `0 0 ${theme.spacing.lg} 0`,
  },
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  impactHeading: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  impactItem: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.xs} 0`,
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
  thankYou: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
    margin: "0",
  },
};

export default IdeaImplemented;
