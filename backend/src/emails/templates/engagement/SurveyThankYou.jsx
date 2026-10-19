import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * SurveyThankYou Template
 *
 * Thank you email sent after a user completes a satisfaction survey.
 *
 * @param {Object} props
 * @param {string} props.userName - User's name
 * @param {number} props.rating - The rating they gave (1-5)
 * @param {string} props.browseIdeasUrl - URL to browse ideas
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function SurveyThankYou({
  _userName = "there",
  rating = null,
  browseIdeasUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  // #897: feedback is about Business Review 360 (the product), not the
  // user's tenant. The paired SatisfactionSurvey email is hardcoded the
  // same way. organizationName stays in Header/Footer for visual branding.
  const previewText = `Thank you for your feedback about Business Review 360!`;

  // Generate response message based on rating
  const getResponseMessage = () => {
    if (!rating) {
      return "We appreciate you taking the time to share your thoughts.";
    }
    if (rating >= 4) {
      return "We're thrilled to hear you're having a great experience! Your positive feedback motivates our team.";
    }
    if (rating === 3) {
      return "Thank you for your honest feedback. We're always looking for ways to improve and your input helps us do that.";
    }
    return "We're sorry to hear the experience hasn't met your expectations. Your feedback is valuable and we'll work to improve.";
  };

  // Generate stars display
  const renderStars = () => {
    if (!rating) return null;
    return (
      <Text style={styles.starsDisplay}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ color: i <= rating ? "#FFD700" : theme.colors.textMuted }}>
            {"\u2B50"}
          </span>
        ))}
      </Text>
    );
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        {/* Hero */}
        <Section center padding="lg">
          <Text style={styles.emoji}>{"\uD83D\uDE4F"}</Text>
          <Text style={styles.heading}>Thank You for Your Feedback!</Text>
          {rating && (
            <Section
              backgroundColor={theme.colors.backgroundLight}
              padding="md"
              style={{ borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.md }}
            >
              <Text style={styles.ratingLabel}>You rated us:</Text>
              {renderStars()}
            </Section>
          )}
        </Section>

        <Divider margin="md" />

        {/* Message */}
        <Section>
          <Text style={styles.paragraph}>{getResponseMessage()}</Text>
        </Section>

        <Divider margin="md" />

        {/* What We Do With Feedback */}
        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="md"
          style={{ borderRadius: theme.borderRadius.lg }}
        >
          <Text style={styles.sectionTitle}>Your Feedback Helps Us:</Text>
          <table style={styles.benefitsTable} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td style={styles.benefitCell}>
                  <Text style={styles.benefitItem}>
                    {"\u2713"} Improve the platform for everyone
                  </Text>
                </td>
              </tr>
              <tr>
                <td style={styles.benefitCell}>
                  <Text style={styles.benefitItem}>
                    {"\u2713"} Prioritize features that matter most
                  </Text>
                </td>
              </tr>
              <tr>
                <td style={styles.benefitCell}>
                  <Text style={styles.benefitItem}>
                    {"\u2713"} Create a better experience for your team
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Divider margin="lg" />

        {/* CTA */}
        <Section center>
          <Text style={styles.ctaText}>Continue making a difference with your ideas!</Text>
          <Button href={browseIdeasUrl} color={primaryColor}>
            Back to Ideas
          </Button>
        </Section>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  emoji: {
    fontSize: "48px",
    margin: "0",
    lineHeight: "1",
  },
  heading: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `${theme.spacing.md} 0 0 0`,
    textAlign: "center",
  },
  ratingLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.sm} 0`,
    textAlign: "center",
  },
  starsDisplay: {
    fontSize: "24px",
    textAlign: "center",
    margin: "0",
    letterSpacing: "4px",
  },
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    textAlign: "center",
    margin: "0",
  },
  sectionTitle: {
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
  ctaText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
};

export default SurveyThankYou;
