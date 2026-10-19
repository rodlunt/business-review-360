import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * SatisfactionSurvey Template
 *
 * Quarterly satisfaction survey to gather user feedback.
 * Includes one-click rating and optional full survey link.
 *
 * @param {Object} props
 * @param {string} props.userName - User's name
 * @param {string} props.surveyToken - Token for tracking survey responses
 * @param {string} props.ratingBaseUrl - Base URL for one-click ratings
 * @param {string} props.fullSurveyUrl - URL for detailed survey (optional)
 * @param {string} props.preferencesUrl - URL to notification preferences
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function SatisfactionSurvey({
  userName = "there",
  surveyToken,
  ratingBaseUrl,
  fullSurveyUrl = null,
  preferencesUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  // #897: the survey question text targets Business Review 360 (the
  // product) hardcoded, regardless of the user's tenant. The page at
  // /feedback does the same. organizationName is still consumed below
  // by Header/Footer for tenant visual branding (logo, colour).
  const previewText = `Quick question: How is Business Review 360 working for you?`;

  // Generate one-click rating URLs
  const getRatingUrl = (rating) => `${ratingBaseUrl}?token=${surveyToken}&rating=${rating}`;

  // Star rating button generator
  const StarButton = ({ rating, filled = false }) => {
    const starStyle = {
      ...styles.starButton,
      backgroundColor: filled ? primaryColor : theme.colors.backgroundLight,
      color: filled ? "#ffffff" : theme.colors.textMuted,
      textDecoration: "none",
    };

    return (
      <td style={styles.starCell}>
        <Link href={getRatingUrl(rating)} style={starStyle}>
          {"\u2B50"}
        </Link>
        <Text style={styles.starLabel}>{rating}</Text>
      </td>
    );
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        {/* Greeting */}
        <Text style={styles.greeting}>Hi {userName},</Text>
        <Text style={styles.paragraph}>
          We'd love to hear how your experience has been with Business Review 360. Your feedback
          helps us improve for everyone!
        </Text>
      </Section>

      <Divider margin="md" />

      {/* One-Click Rating */}
      <Section center>
        <Text style={styles.questionTitle}>How satisfied are you with Business Review 360?</Text>

        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="lg"
          style={{ borderRadius: theme.borderRadius.lg }}
        >
          <table style={styles.starTable} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <StarButton rating={1} />
                <StarButton rating={2} />
                <StarButton rating={3} />
                <StarButton rating={4} />
                <StarButton rating={5} />
              </tr>
            </tbody>
          </table>

          <table style={styles.labelTable} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td style={styles.labelLeft}>
                  <Text style={styles.ratingLabel}>Very Dissatisfied</Text>
                </td>
                <td style={styles.labelRight}>
                  <Text style={styles.ratingLabel}>Very Satisfied</Text>
                </td>
              </tr>
            </tbody>
          </table>

          <Text style={styles.instruction}>Just click a star above to rate!</Text>
        </Section>
      </Section>

      <Divider margin="md" />

      {/* Optional Full Survey */}
      {fullSurveyUrl && (
        <>
          <Section center>
            <Text style={styles.moreFeedback}>Want to tell us more? (Optional)</Text>
            <Button href={fullSurveyUrl} color={primaryColor} variant="outline">
              Take Full Survey - 2 minutes
            </Button>
          </Section>
          <Divider margin="md" />
        </>
      )}

      {/* Why Feedback Matters */}
      <Section
        backgroundColor={theme.colors.backgroundLight}
        padding="md"
        style={{ borderRadius: theme.borderRadius.lg }}
      >
        <Text style={styles.feedbackTitle}>Your Feedback Helps Us:</Text>
        <table style={styles.benefitsTable} cellPadding="0" cellSpacing="0">
          <tbody>
            <tr>
              <td style={styles.benefitCell}>
                <Text style={styles.benefitItem}>{"\u2713"} Improve the platform</Text>
              </td>
            </tr>
            <tr>
              <td style={styles.benefitCell}>
                <Text style={styles.benefitItem}>{"\u2713"} Prioritize new features</Text>
              </td>
            </tr>
            <tr>
              <td style={styles.benefitCell}>
                <Text style={styles.benefitItem}>{"\u2713"} Better serve our community</Text>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Divider margin="lg" />

      {/* Thank You */}
      <Section center>
        <Text style={styles.thankYou}>Thank you! {"\uD83D\uDE4F"}</Text>
        <Text style={styles.privacyNote}>
          Your response is confidential and will only be used to improve our service.
        </Text>
      </Section>

      <Divider margin="md" />

      {/* Unsubscribe */}
      <Section center>
        <Text style={styles.unsubscribeNote}>
          Don't want to receive surveys?{" "}
          <Link href={preferencesUrl} style={{ color: primaryColor }}>
            Manage your preferences
          </Link>
        </Text>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  greeting: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    margin: "0",
  },
  questionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  starTable: {
    margin: "0 auto",
    borderCollapse: "separate",
    borderSpacing: theme.spacing.sm,
  },
  starCell: {
    textAlign: "center",
    padding: `0 ${theme.spacing.xs}`,
  },
  starButton: {
    display: "inline-block",
    width: "48px",
    height: "48px",
    lineHeight: "48px",
    fontSize: "24px",
    borderRadius: theme.borderRadius.lg,
    textAlign: "center",
    cursor: "pointer",
  },
  starLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `${theme.spacing.xs} 0 0 0`,
  },
  labelTable: {
    width: "100%",
    marginTop: theme.spacing.md,
  },
  labelLeft: {
    textAlign: "left",
    width: "50%",
  },
  labelRight: {
    textAlign: "right",
    width: "50%",
  },
  ratingLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  instruction: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: `${theme.spacing.md} 0 0 0`,
    fontStyle: "italic",
  },
  moreFeedback: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  feedbackTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  benefitsTable: {
    width: "100%",
  },
  benefitCell: {
    padding: `${theme.spacing.xs} 0`,
  },
  benefitItem: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.success,
    margin: "0",
  },
  thankYou: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: "0",
  },
  privacyNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `${theme.spacing.sm} 0 0 0`,
  },
  unsubscribeNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    margin: "0",
  },
};

export default SatisfactionSurvey;
