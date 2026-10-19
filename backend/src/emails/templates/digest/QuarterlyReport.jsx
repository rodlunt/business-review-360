import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { StatsCard, StatsRow } from "../../components/StatsCard.jsx";
import { ContributorCard, ContributorList } from "../../components/ContributorCard.jsx";
import { theme } from "../../styles/theme.js";

/**
 * QuarterlyReport Template
 *
 * Quarterly achievement report sent to all users and admins.
 * Sent on the 1st of each quarter (Jan, Apr, Jul, Oct) at 9 AM.
 *
 * @param {Object} props
 * @param {string} props.recipientName - Recipient's name
 * @param {number} props.quarter - Quarter number (1, 2, 3, or 4)
 * @param {number} props.year - Year (e.g., 2025)
 * @param {Object} props.stats - Quarterly statistics
 * @param {number} props.stats.submitted - Ideas submitted
 * @param {number} props.stats.implemented - Ideas implemented
 * @param {number} props.stats.totalTimeSavedMinutes - Total time saved
 * @param {number} props.stats.estimatedCostSavings - Estimated cost savings
 * @param {Array} props.majorImplementations - Major implementations this quarter
 * @param {Array} props.topIdeas - Top ideas of the quarter
 * @param {Array} props.topContributors - Top contributors
 * @param {Object} props.participationStats - Participation metrics
 * @param {number} props.participationStats.activeUsers - Number of active users
 * @param {number} props.participationStats.totalUsers - Total users
 * @param {number} props.participationStats.percentActive - Percentage active
 * @param {Array} props.successStories - Success story narratives
 * @param {Array} props.nextQuarterGoals - Goals for next quarter
 * @param {string} props.achievementsUrl - URL to view all achievements
 * @param {string} props.submitIdeaUrl - URL to submit a new idea
 * @param {string} props.preferencesUrl - URL to notification preferences
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function QuarterlyReport({
  recipientName = "there",
  quarter = 1,
  year = new Date().getFullYear(),
  stats = { submitted: 0, implemented: 0, totalTimeSavedMinutes: 0, estimatedCostSavings: 0 },
  majorImplementations = [],
  _topIdeas = [],
  topContributors = [],
  participationStats = { activeUsers: 0, totalUsers: 0, percentActive: 0 },
  successStories = [],
  nextQuarterGoals = [],
  achievementsUrl,
  submitIdeaUrl,
  preferencesUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const quarterName = `Q${quarter}`;
  const previewText = `${quarterName} ${year} Achievement Report - ${organizationName}: ${stats.implemented} ideas implemented, $${stats.estimatedCostSavings.toLocaleString()} saved`;

  // Format hours from minutes
  const formatHours = (minutes) => {
    if (!minutes) return "0";
    const hours = Math.floor(minutes / 60);
    return hours.toLocaleString();
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        {/* Hero Section */}
        <Section
          backgroundColor={primaryColor}
          padding="xl"
          center
          style={{ borderRadius: theme.borderRadius.lg }}
        >
          <Text style={styles.heroTitle}>
            {quarterName} {year}
          </Text>
          <Text style={styles.heroSubtitle}>Achievement Report</Text>
          <Text style={styles.heroOrg}>{organizationName}</Text>
        </Section>

        <Section padding="lg">
          <Text style={styles.greeting}>Hi {recipientName},</Text>
          <Text style={styles.paragraph}>
            What an incredible quarter! Here's a celebration of what we've accomplished together
            through innovation and collaboration.
          </Text>
        </Section>
      </Section>

      <Divider margin="md" />

      {/* Quarter in Review - Big Numbers */}
      <Section>
        <Text style={styles.sectionTitle}>{"\uD83D\uDE80"} Quarter in Review</Text>
        <StatsRow>
          <StatsCard
            icon={"\uD83D\uDCA1"}
            value={stats.submitted}
            label="Ideas Submitted"
            primaryColor={primaryColor}
          />
          <StatsCard
            icon={"\u2728"}
            value={stats.implemented}
            label="Ideas Implemented"
            primaryColor={theme.colors.success}
          />
        </StatsRow>
        <StatsRow>
          <StatsCard
            icon={"\u23F1\uFE0F"}
            value={`${formatHours(stats.totalTimeSavedMinutes)}h`}
            label="Hours Saved"
            primaryColor={theme.colors.success}
          />
          <StatsCard
            icon={"\uD83D\uDCB0"}
            value={`$${stats.estimatedCostSavings.toLocaleString()}`}
            label="Estimated Savings"
            primaryColor={primaryColor}
          />
        </StatsRow>
      </Section>

      <Divider margin="lg" />

      {/* Major Implementations */}
      {majorImplementations.length > 0 && (
        <>
          <Section>
            <Text style={styles.sectionTitle}>{"\uD83C\uDFC6"} Major Implementations</Text>
            <Text style={styles.sectionIntro}>
              These ideas made a real difference this quarter:
            </Text>

            {majorImplementations.slice(0, 5).map((impl, index) => (
              <Section
                key={index}
                backgroundColor={theme.colors.backgroundLight}
                padding="md"
                style={{ borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.md }}
              >
                <table style={styles.implTable} cellPadding="0" cellSpacing="0">
                  <tbody>
                    <tr>
                      <td style={styles.implNumber}>
                        <Text style={{ ...styles.implBadge, backgroundColor: primaryColor }}>
                          {index + 1}
                        </Text>
                      </td>
                      <td style={styles.implContent}>
                        <Link href={impl.url} style={{ ...styles.implTitle, color: primaryColor }}>
                          {impl.title}
                        </Link>
                        {impl.impact && (
                          <Text style={styles.implImpact}>
                            {"\uD83C\uDFAF"} Impact: {impl.impact}
                          </Text>
                        )}
                        {impl.status && (
                          <Text style={styles.implStatus}>
                            {"\u2705"} Status: {impl.status}
                          </Text>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            ))}
          </Section>
          <Divider margin="lg" />
        </>
      )}

      {/* Top Contributors */}
      {topContributors.length > 0 && (
        <>
          <Section>
            <Text style={styles.sectionTitle}>
              {"\uD83C\uDF1F"} Top Contributors {quarterName}
            </Text>
            <Text style={styles.sectionIntro}>Thank you to our most active innovators:</Text>
            <ContributorList>
              {topContributors.slice(0, 5).map((contributor, index) => (
                <ContributorCard
                  key={index}
                  rank={index + 1}
                  name={contributor.name}
                  ideasCount={contributor.ideasCount}
                  commentsCount={contributor.commentsCount}
                  implementedCount={contributor.implementedCount}
                  primaryColor={primaryColor}
                />
              ))}
            </ContributorList>
          </Section>
          <Divider margin="lg" />
        </>
      )}

      {/* Participation Stats */}
      <Section>
        <Text style={styles.sectionTitle}>{"\uD83D\uDC65"} Team Participation</Text>
        <Section
          backgroundColor={theme.colors.backgroundLight}
          padding="lg"
          center
          style={{ borderRadius: theme.borderRadius.lg }}
        >
          <Text style={{ ...styles.participationNumber, color: primaryColor }}>
            {participationStats.percentActive}%
          </Text>
          <Text style={styles.participationLabel}>of your team was active this quarter</Text>
          <Text style={styles.participationDetail}>
            {participationStats.activeUsers} out of {participationStats.totalUsers} team members
            contributed ideas or feedback
          </Text>
        </Section>
      </Section>

      <Divider margin="lg" />

      {/* Success Stories */}
      {successStories.length > 0 && (
        <>
          <Section>
            <Text style={styles.sectionTitle}>{"\uD83D\uDCD6"} Success Stories</Text>
            {successStories.slice(0, 3).map((story, index) => (
              <Section
                key={index}
                backgroundColor={theme.colors.backgroundWhite}
                padding="md"
                style={{
                  borderLeft: `4px solid ${primaryColor}`,
                  marginBottom: theme.spacing.md,
                }}
              >
                <Text style={styles.storyQuote}>"{story.quote}"</Text>
                <Text style={styles.storyAttribution}>
                  - {story.author}, on "{story.ideaTitle}"
                </Text>
              </Section>
            ))}
          </Section>
          <Divider margin="lg" />
        </>
      )}

      {/* Looking Ahead */}
      {nextQuarterGoals.length > 0 && (
        <>
          <Section>
            <Text style={styles.sectionTitle}>
              {"\uD83D\uDD2E"} Looking Ahead: Q{quarter === 4 ? 1 : quarter + 1} Goals
            </Text>
            <Section
              backgroundColor={theme.colors.backgroundLight}
              padding="md"
              style={{ borderRadius: theme.borderRadius.lg }}
            >
              {nextQuarterGoals.map((goal, index) => (
                <Text key={index} style={styles.goalItem}>
                  {"\u2022"} {goal}
                </Text>
              ))}
            </Section>
          </Section>
          <Divider margin="lg" />
        </>
      )}

      {/* Thank You Message */}
      <Section center>
        <Text style={styles.thankYou}>
          {"\uD83D\uDE4F"} Thank you for making our organization better!
        </Text>
        <Text style={styles.thankYouSub}>Every idea, comment, and vote helps us improve.</Text>
      </Section>

      <Divider margin="md" />

      {/* Call to Action */}
      <Section center>
        <table cellPadding="0" cellSpacing="0" style={styles.ctaTable}>
          <tbody>
            <tr>
              <td style={styles.ctaCell}>
                <Button href={achievementsUrl} color={primaryColor}>
                  View All Achievements
                </Button>
              </td>
              <td style={styles.ctaCell}>
                <Button href={submitIdeaUrl} color={primaryColor} variant="outline">
                  Submit Q{quarter === 4 ? 1 : quarter + 1} Idea
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Divider margin="lg" />

      {/* Footer note */}
      <Text style={styles.footerNote}>
        You're receiving this quarterly report because you're a member of {organizationName}.{" "}
        <Link href={preferencesUrl} style={{ color: primaryColor }}>
          Manage your preferences
        </Link>
      </Text>

      <Footer
        organizationName={organizationName}
        showUnsubscribe={true}
        unsubscribeUrl={preferencesUrl}
      />
    </EmailLayout>
  );
}

const styles = {
  heroTitle: {
    fontSize: theme.typography.fontSize["3xl"],
    fontWeight: theme.typography.fontWeight.bold,
    color: "#ffffff",
    margin: "0",
    lineHeight: "1.2",
  },
  heroSubtitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.medium,
    color: "rgba(255, 255, 255, 0.9)",
    margin: `${theme.spacing.sm} 0 0 0`,
  },
  heroOrg: {
    fontSize: theme.typography.fontSize.base,
    color: "rgba(255, 255, 255, 0.8)",
    margin: `${theme.spacing.md} 0 0 0`,
  },
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
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  sectionIntro: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  implTable: {
    width: "100%",
  },
  implNumber: {
    width: "48px",
    verticalAlign: "top",
    paddingRight: theme.spacing.md,
  },
  implBadge: {
    color: "#ffffff",
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    width: "32px",
    height: "32px",
    lineHeight: "32px",
    textAlign: "center",
    borderRadius: theme.borderRadius.full,
    margin: "0",
  },
  implContent: {
    verticalAlign: "top",
  },
  implTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecoration: "none",
    display: "block",
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  implImpact: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.success,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  implStatus: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  participationNumber: {
    fontSize: "48px",
    fontWeight: theme.typography.fontWeight.bold,
    margin: "0",
    lineHeight: "1",
  },
  participationLabel: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text,
    margin: `${theme.spacing.sm} 0`,
  },
  participationDetail: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  storyQuote: {
    fontSize: theme.typography.fontSize.base,
    fontStyle: "italic",
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.relaxed,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  storyAttribution: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  goalItem: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
    paddingLeft: theme.spacing.md,
  },
  thankYou: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  thankYouSub: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  ctaTable: {
    margin: "0 auto",
  },
  ctaCell: {
    padding: `0 ${theme.spacing.sm}`,
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: "0",
  },
};

export default QuarterlyReport;
