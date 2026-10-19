import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { StatsCard, StatsRow } from "../../components/StatsCard.jsx";
import { IdeaSummaryCard, IdeaSummaryList } from "../../components/IdeaSummaryCard.jsx";
import { theme } from "../../styles/theme.js";

/**
 * WeeklyUserSummary Template
 *
 * Weekly digest email sent to users with their activity and organization highlights.
 * Sent every Monday at 9 AM to users who have opted in.
 *
 * @param {Object} props
 * @param {string} props.userName - User's name
 * @param {Object} props.userStats - User's activity this week
 * @param {number} props.userStats.ideasSubmitted - Number of ideas submitted
 * @param {number} props.userStats.commentsMade - Number of comments made
 * @param {Array} props.watchedIdeasUpdates - Ideas the user is watching with updates
 * @param {Array} props.topIdeas - Top trending ideas this week
 * @param {Array} props.recentImplementations - Recently implemented ideas
 * @param {string} props.weekStartDate - Start of week (e.g., "March 18")
 * @param {string} props.weekEndDate - End of week (e.g., "March 24")
 * @param {string} props.browseIdeasUrl - URL to browse all ideas
 * @param {string} props.submitIdeaUrl - URL to submit a new idea
 * @param {string} props.preferencesUrl - URL to notification preferences
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function WeeklyUserSummary({
  userName = "there",
  userStats = { ideasSubmitted: 0, commentsMade: 0 },
  watchedIdeasUpdates = [],
  topIdeas = [],
  recentImplementations = [],
  weekStartDate = "",
  weekEndDate = "",
  browseIdeasUrl,
  submitIdeaUrl,
  preferencesUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `Your week at ${organizationName} - ${weekStartDate} to ${weekEndDate}`;
  const hasActivity = userStats.ideasSubmitted > 0 || userStats.commentsMade > 0;
  const hasUpdates = watchedIdeasUpdates.length > 0;
  const hasHighlights = topIdeas.length > 0 || recentImplementations.length > 0;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        {/* Title with date range */}
        <Text style={styles.heading}>Your Week at {organizationName}</Text>
        <Text style={styles.dateRange}>
          {weekStartDate} - {weekEndDate}, {new Date().getFullYear()}
        </Text>

        <Text style={styles.greeting}>Hi {userName},</Text>
        <Text style={styles.paragraph}>
          Here's a summary of your activity and what's happening in your organization this week.
        </Text>
      </Section>

      <Divider margin="md" />

      {/* Your Activity Section */}
      <Section>
        <Text style={styles.sectionTitle}>Your Activity</Text>
        <StatsRow>
          <StatsCard
            icon={"\u270F\uFE0F"}
            value={userStats.ideasSubmitted}
            label="Ideas Submitted"
            primaryColor={primaryColor}
          />
          <StatsCard
            icon={"\uD83D\uDCAC"}
            value={userStats.commentsMade}
            label="Comments Made"
            primaryColor={primaryColor}
          />
        </StatsRow>

        {!hasActivity && (
          <Section backgroundColor={theme.colors.backgroundLight} padding="md">
            <Text style={styles.emptyState}>No activity this week. Why not share an idea?</Text>
            <Button href={submitIdeaUrl} color={primaryColor} size="sm">
              Submit an Idea
            </Button>
          </Section>
        )}
      </Section>

      <Divider margin="md" />

      {/* Ideas You're Watching */}
      {hasUpdates && (
        <>
          <Section>
            <IdeaSummaryList title="Ideas You're Watching" icon={"\uD83D\uDC41\uFE0F"}>
              {watchedIdeasUpdates.slice(0, 5).map((idea, index) => (
                <IdeaSummaryCard
                  key={index}
                  title={idea.title}
                  url={idea.url}
                  status={idea.status}
                  commentCount={idea.newCommentCount}
                  updateText={idea.latestUpdate}
                  primaryColor={primaryColor}
                />
              ))}
            </IdeaSummaryList>
          </Section>
          <Divider margin="md" />
        </>
      )}

      {/* This Week's Highlights */}
      {hasHighlights && (
        <Section>
          <Text style={styles.sectionTitle}>This Week's Highlights</Text>

          {/* Trending Ideas */}
          {topIdeas.length > 0 && (
            <Section padding="none">
              <Text style={styles.subsectionTitle}>{"\uD83D\uDD25"} Trending Ideas</Text>
              {topIdeas.slice(0, 3).map((idea, index) => (
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
          )}

          {/* Recently Implemented */}
          {recentImplementations.length > 0 && (
            <Section padding="none" style={{ marginTop: theme.spacing.lg }}>
              <Text style={styles.subsectionTitle}>{"\uD83C\uDF89"} Recently Implemented</Text>
              {recentImplementations.slice(0, 3).map((idea, index) => (
                <IdeaSummaryCard
                  key={index}
                  title={idea.title}
                  url={idea.url}
                  status="Implemented"
                  timeSavedMinutes={idea.timeSavedMinutes}
                  updateText={idea.impact}
                  primaryColor={primaryColor}
                />
              ))}
            </Section>
          )}
        </Section>
      )}

      {/* Empty state if no highlights */}
      {!hasHighlights && !hasUpdates && (
        <Section backgroundColor={theme.colors.backgroundLight} padding="md" center>
          <Text style={styles.emptyState}>
            It's been a quiet week! Be the first to submit an idea.
          </Text>
        </Section>
      )}

      <Divider margin="lg" />

      {/* Call to Action */}
      <Section center>
        <table cellPadding="0" cellSpacing="0" style={styles.ctaTable}>
          <tbody>
            <tr>
              <td style={styles.ctaCell}>
                <Button href={browseIdeasUrl} color={primaryColor}>
                  Browse All Ideas
                </Button>
              </td>
              <td style={styles.ctaCell}>
                <Button href={submitIdeaUrl} color={primaryColor} variant="outline">
                  Submit New Idea
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Divider margin="lg" />

      {/* Footer note */}
      <Text style={styles.footerNote}>
        You're receiving this weekly summary because you opted in to digest emails.{" "}
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
  heading: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: "0",
    textAlign: "center",
  },
  dateRange: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    margin: `${theme.spacing.sm} 0 ${theme.spacing.lg} 0`,
    textAlign: "center",
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
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  subsectionTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  emptyState: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: "center",
    margin: `0 0 ${theme.spacing.md} 0`,
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

export default WeeklyUserSummary;
