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
 * MonthlyAdminSummary Template
 *
 * Monthly summary email for organization admins with metrics and insights.
 * Sent on the 1st of each month at 9 AM.
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin's name
 * @param {string} props.month - Month name (e.g., "March")
 * @param {number} props.year - Year (e.g., 2025)
 * @param {Object} props.stats - Monthly statistics
 * @param {number} props.stats.submitted - Ideas submitted
 * @param {number} props.stats.approved - Ideas approved
 * @param {number} props.stats.implemented - Ideas implemented
 * @param {number} props.stats.rejected - Ideas rejected
 * @param {Object} props.trends - Week-over-week changes
 * @param {string} props.trends.submitted - e.g., "+20%" or "-5%"
 * @param {Array} props.topContributors - Top contributors for the month
 * @param {number} props.pendingReviewCount - Ideas awaiting review
 * @param {number} props.totalComments - Total comments this month
 * @param {number} props.totalVotes - Total votes this month
 * @param {number} props.activeUserPercent - Percentage of active users
 * @param {number} props.totalTimeSavedMinutes - Total time saved from implementations
 * @param {Array} props.actionItems - Items needing admin attention
 * @param {string} props.dashboardUrl - URL to admin dashboard
 * @param {string} props.reviewUrl - URL to review pending ideas
 * @param {string} props.preferencesUrl - URL to notification preferences
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 */
export function MonthlyAdminSummary({
  adminName = "Admin",
  month = "Month",
  year = new Date().getFullYear(),
  stats = { submitted: 0, approved: 0, implemented: 0, rejected: 0 },
  trends = {},
  topContributors = [],
  pendingReviewCount = 0,
  totalComments = 0,
  totalVotes = 0,
  activeUserPercent = 0,
  totalTimeSavedMinutes = 0,
  actionItems = [],
  dashboardUrl,
  reviewUrl,
  preferencesUrl,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
}) {
  const previewText = `${month} ${year} Summary - ${organizationName}: ${stats.submitted} ideas, ${stats.implemented} implemented`;

  // Format hours for display
  const formatHours = (minutes) => {
    if (!minutes) return "0";
    const hours = Math.floor(minutes / 60);
    return hours.toLocaleString();
  };

  // Estimate cost savings ($30/hour average)
  const estimatedSavings = Math.round((totalTimeSavedMinutes / 60) * 30);

  // Parse trend for positive/negative
  const parseTrend = (trend) => {
    if (!trend) return { value: null, positive: true };
    const positive = !trend.startsWith("-");
    return { value: trend, positive };
  };

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        {/* Title */}
        <Text style={styles.heading}>
          {month} {year} Monthly Summary
        </Text>
        <Text style={styles.subtitle}>{organizationName}</Text>

        <Text style={styles.greeting}>Hi {adminName},</Text>
        <Text style={styles.paragraph}>
          Here's your monthly overview of innovation activity and key metrics.
        </Text>
      </Section>

      <Divider margin="md" />

      {/* Ideas This Month */}
      <Section>
        <Text style={styles.sectionTitle}>{"\uD83D\uDCCA"} Ideas This Month</Text>
        <StatsRow>
          <StatsCard
            icon={"\uD83D\uDCDD"}
            value={stats.submitted}
            label="Submitted"
            trend={parseTrend(trends.submitted).value}
            trendPositive={parseTrend(trends.submitted).positive}
            primaryColor={primaryColor}
          />
          <StatsCard
            icon={"\u2705"}
            value={stats.approved}
            label="Approved"
            primaryColor={primaryColor}
          />
          <StatsCard
            icon={"\uD83C\uDF89"}
            value={stats.implemented}
            label="Implemented"
            primaryColor={theme.colors.success}
          />
          <StatsCard
            icon={"\u274C"}
            value={stats.rejected}
            label="Rejected"
            primaryColor={theme.colors.error}
          />
        </StatsRow>
      </Section>

      <Divider margin="md" />

      {/* Time & Value */}
      <Section>
        <Text style={styles.sectionTitle}>{"\u23F1\uFE0F"} Time & Value Saved</Text>
        <Section backgroundColor={theme.colors.backgroundLight} padding="md">
          <table style={styles.valueTable} cellPadding="0" cellSpacing="0">
            <tbody>
              <tr>
                <td style={styles.valueCell}>
                  <Text style={{ ...styles.bigValue, color: theme.colors.success }}>
                    {formatHours(totalTimeSavedMinutes)}h
                  </Text>
                  <Text style={styles.valueLabel}>Hours Saved</Text>
                </td>
                <td style={styles.valueDivider}></td>
                <td style={styles.valueCell}>
                  <Text style={{ ...styles.bigValue, color: primaryColor }}>
                    ${estimatedSavings.toLocaleString()}
                  </Text>
                  <Text style={styles.valueLabel}>Estimated Savings</Text>
                </td>
              </tr>
            </tbody>
          </table>
          <Text style={styles.valueNote}>
            Based on {stats.implemented} implemented idea{stats.implemented !== 1 ? "s" : ""} at
            $30/hour average
          </Text>
        </Section>
      </Section>

      <Divider margin="md" />

      {/* Top Contributors */}
      {topContributors.length > 0 && (
        <>
          <Section>
            <Text style={styles.sectionTitle}>{"\uD83C\uDFC6"} Top Contributors</Text>
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
          <Divider margin="md" />
        </>
      )}

      {/* Engagement Metrics */}
      <Section>
        <Text style={styles.sectionTitle}>{"\uD83D\uDCAC"} Engagement Metrics</Text>
        <StatsRow>
          <StatsCard
            icon={"\uD83D\uDDE3\uFE0F"}
            value={totalComments}
            label="Comments"
            primaryColor={primaryColor}
          />
          <StatsCard
            icon={"\uD83D\uDC4D"}
            value={totalVotes}
            label="Votes"
            primaryColor={primaryColor}
          />
          <StatsCard
            icon={"\uD83D\uDC65"}
            value={`${activeUserPercent}%`}
            label="Active Users"
            primaryColor={activeUserPercent >= 50 ? theme.colors.success : theme.colors.warning}
          />
        </StatsRow>
      </Section>

      <Divider margin="md" />

      {/* Action Items */}
      {(pendingReviewCount > 0 || actionItems.length > 0) && (
        <>
          <Section>
            <Text style={styles.sectionTitle}>{"\u26A0\uFE0F"} Action Items</Text>

            {pendingReviewCount > 0 && (
              <Section
                backgroundColor={theme.colors.warningLight}
                padding="md"
                style={{
                  backgroundColor: "#fff3e0",
                  borderRadius: theme.borderRadius.lg,
                  marginBottom: theme.spacing.md,
                }}
              >
                <table style={styles.actionTable} cellPadding="0" cellSpacing="0">
                  <tbody>
                    <tr>
                      <td style={styles.actionIcon}>
                        <Text style={{ margin: 0, fontSize: "24px" }}>{"\uD83D\uDCCB"}</Text>
                      </td>
                      <td style={styles.actionContent}>
                        <Text style={styles.actionTitle}>
                          {pendingReviewCount} idea{pendingReviewCount !== 1 ? "s" : ""} pending
                          review
                        </Text>
                        <Text style={styles.actionDesc}>
                          Ideas are waiting for admin review and feedback
                        </Text>
                      </td>
                      <td style={styles.actionButton}>
                        <Link
                          href={reviewUrl}
                          style={{ ...styles.actionLink, color: primaryColor }}
                        >
                          Review Now
                        </Link>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            )}

            {actionItems.map((item, index) => (
              <Section
                key={index}
                backgroundColor={theme.colors.backgroundLight}
                padding="md"
                style={{ borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.sm }}
              >
                <table style={styles.actionTable} cellPadding="0" cellSpacing="0">
                  <tbody>
                    <tr>
                      <td style={styles.actionIcon}>
                        <Text style={{ margin: 0, fontSize: "24px" }}>
                          {item.icon || "\u2139\uFE0F"}
                        </Text>
                      </td>
                      <td style={styles.actionContent}>
                        <Text style={styles.actionTitle}>{item.title}</Text>
                        <Text style={styles.actionDesc}>{item.description}</Text>
                      </td>
                      {item.url && (
                        <td style={styles.actionButton}>
                          <Link
                            href={item.url}
                            style={{ ...styles.actionLink, color: primaryColor }}
                          >
                            {item.actionText || "View"}
                          </Link>
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </Section>
            ))}
          </Section>
          <Divider margin="md" />
        </>
      )}

      {/* Call to Action */}
      <Section center>
        <Button href={dashboardUrl} color={primaryColor}>
          View Full Dashboard
        </Button>
      </Section>

      <Divider margin="lg" />

      {/* Footer note */}
      <Text style={styles.footerNote}>
        You're receiving this monthly summary because you're an admin of {organizationName}.{" "}
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
  subtitle: {
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
  valueTable: {
    width: "100%",
    textAlign: "center",
  },
  valueCell: {
    width: "45%",
    padding: theme.spacing.md,
    verticalAlign: "middle",
  },
  valueDivider: {
    width: "10%",
    borderLeft: `1px solid ${theme.colors.border}`,
  },
  bigValue: {
    fontSize: theme.typography.fontSize["3xl"],
    fontWeight: theme.typography.fontWeight.bold,
    margin: "0",
    lineHeight: "1.2",
  },
  valueLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `${theme.spacing.xs} 0 0 0`,
  },
  valueNote: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: `${theme.spacing.md} 0 0 0`,
  },
  actionTable: {
    width: "100%",
  },
  actionIcon: {
    width: "48px",
    verticalAlign: "middle",
  },
  actionContent: {
    verticalAlign: "middle",
    paddingRight: theme.spacing.md,
  },
  actionButton: {
    width: "100px",
    textAlign: "right",
    verticalAlign: "middle",
  },
  actionTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  actionDesc: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  actionLink: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecoration: "none",
  },
  footerNote: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    textAlign: "center",
    margin: "0",
  },
};

export default MonthlyAdminSummary;
