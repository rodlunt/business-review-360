import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { IdeaSummaryCard } from "../../components/IdeaSummaryCard.jsx";
import { theme } from "../../styles/theme.js";

/**
 * InactiveUserReengagement Template
 *
 * Re-engagement email for users who haven't logged in for 30+ days.
 * Sent to encourage return and show what they've missed.
 *
 * @param {Object} props
 * @param {string} props.userName - User's name
 * @param {number} props.daysSinceLastLogin - Days since last login
 * @param {number} props.newIdeasCount - New ideas since last login
 * @param {number} props.newImplementationsCount - Ideas implemented since last login
 * @param {Array} props.highlightedIdeas - Notable new ideas to show
 * @param {string} props.loginUrl - Direct login URL
 * @param {string} props.browseIdeasUrl - URL to browse all ideas
 * @param {string} props.submitIdeaUrl - URL to submit new idea
 * @param {string} props.unsubscribeUrl - URL to unsubscribe from engagement emails
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function InactiveUserReengagement({
  userName = "there",
  daysSinceLastLogin = 30,
  newIdeasCount = 0,
  newImplementationsCount = 0,
  highlightedIdeas = [],
  loginUrl,
  browseIdeasUrl,
  submitIdeaUrl,
  unsubscribeUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `We miss you at ${organizationName}! ${newIdeasCount} new ideas since you've been away.`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        {/* Hero Message */}
        <Section
          backgroundColor={primaryColor}
          padding="xl"
          center
          style={{ borderRadius: theme.borderRadius.lg }}
        >
          <Text style={styles.heroEmoji}>{"\uD83D\uDC4B"}</Text>
          <Text style={styles.heroTitle}>We Miss You, {userName}!</Text>
          <Text style={styles.heroSubtitle}>
            It's been {daysSinceLastLogin} days since your last visit.
          </Text>
        </Section>

        <Section padding="lg">
          <Text style={styles.paragraph}>
            Your colleagues have been busy sharing ideas to improve {organizationName}. We'd love to
            hear what you're thinking too!
          </Text>
        </Section>
      </Section>

      <Divider margin="md" />

      {/* What They Missed */}
      {(newIdeasCount > 0 || newImplementationsCount > 0) && (
        <Section>
          <Text style={styles.sectionTitle}>{"\uD83D\uDCCB"} While You Were Away</Text>

          <Section
            backgroundColor={theme.colors.backgroundLight}
            padding="md"
            style={{ borderRadius: theme.borderRadius.lg }}
          >
            <table style={styles.statsTable} cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  {newIdeasCount > 0 && (
                    <td style={styles.statCell}>
                      <Text style={styles.statIcon}>{"\uD83D\uDCDD"}</Text>
                      <Text style={{ ...styles.statValue, color: primaryColor }}>
                        {newIdeasCount}
                      </Text>
                      <Text style={styles.statLabel}>
                        new idea{newIdeasCount !== 1 ? "s" : ""} submitted
                      </Text>
                    </td>
                  )}
                  {newImplementationsCount > 0 && (
                    <td style={styles.statCell}>
                      <Text style={styles.statIcon}>{"\uD83C\uDF89"}</Text>
                      <Text style={{ ...styles.statValue, color: theme.colors.success }}>
                        {newImplementationsCount}
                      </Text>
                      <Text style={styles.statLabel}>
                        idea{newImplementationsCount !== 1 ? "s" : ""} implemented
                      </Text>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </Section>
        </Section>
      )}

      {/* Highlighted Ideas */}
      {highlightedIdeas.length > 0 && (
        <>
          <Divider margin="md" />
          <Section>
            <Text style={styles.sectionTitle}>{"\uD83D\uDCA1"} Ideas That Might Interest You</Text>
            {highlightedIdeas.slice(0, 3).map((idea, index) => (
              <IdeaSummaryCard
                key={index}
                title={idea.title}
                url={idea.url}
                authorName={idea.authorName}
                commentCount={idea.commentCount}
                voteCount={idea.voteCount}
                primaryColor={primaryColor}
              />
            ))}
          </Section>
        </>
      )}

      <Divider margin="lg" />

      {/* Call to Action */}
      <Section>
        <Text style={styles.sectionTitle}>{"\u2728"} Your Ideas Matter</Text>
        <Text style={styles.paragraph}>
          Your perspective is valuable. Whether it's a small improvement or a big idea, we'd love to
          hear from you!
        </Text>

        <Section center padding="md">
          <table cellPadding="0" cellSpacing="0" style={styles.ctaTable}>
            <tbody>
              <tr>
                <td style={styles.ctaCell}>
                  <Button href={loginUrl || browseIdeasUrl} color={primaryColor}>
                    Log In & Browse Ideas
                  </Button>
                </td>
              </tr>
              <tr>
                <td style={styles.ctaCell}>
                  <Button href={submitIdeaUrl} color={primaryColor} variant="outline">
                    Share Your Idea
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      </Section>

      <Divider margin="lg" />

      {/* Unsubscribe Option */}
      <Section center>
        <Text style={styles.unsubscribeNote}>
          Not interested in these updates?{" "}
          <Link href={unsubscribeUrl} style={{ color: primaryColor }}>
            Unsubscribe from engagement emails
          </Link>
        </Text>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  heroEmoji: {
    fontSize: "48px",
    margin: `0 0 ${theme.spacing.sm} 0`,
    lineHeight: "1",
  },
  heroTitle: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    color: "#ffffff",
    margin: "0",
    lineHeight: "1.2",
  },
  heroSubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: "rgba(255, 255, 255, 0.9)",
    margin: `${theme.spacing.sm} 0 0 0`,
  },
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    margin: "0",
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  statsTable: {
    width: "100%",
    textAlign: "center",
  },
  statCell: {
    width: "50%",
    padding: theme.spacing.md,
    verticalAlign: "top",
  },
  statIcon: {
    fontSize: "28px",
    margin: `0 0 ${theme.spacing.xs} 0`,
    lineHeight: "1",
  },
  statValue: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    margin: `0 0 ${theme.spacing.xs} 0`,
    lineHeight: "1.2",
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  ctaTable: {
    margin: "0 auto",
  },
  ctaCell: {
    padding: `${theme.spacing.sm} 0`,
    textAlign: "center",
  },
  unsubscribeNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    margin: "0",
  },
};

export default InactiveUserReengagement;
