import React from "react";
import { Text, Link } from "@react-email/components";
import { theme, getStatusStyle } from "../styles/theme.js";

/**
 * IdeaSummaryCard - Compact card for idea lists in digests
 *
 * Used in weekly/monthly/quarterly digest emails.
 *
 * @param {Object} props
 * @param {string} props.title - Idea title
 * @param {string} props.url - URL to the idea
 * @param {string} props.status - Idea status (optional)
 * @param {string} props.authorName - Author's name (optional)
 * @param {number} props.commentCount - Number of comments (optional)
 * @param {number} props.voteCount - Number of votes (optional)
 * @param {number} props.timeSavedMinutes - Time saved in minutes (optional)
 * @param {string} props.updateText - Brief update text (optional)
 * @param {string} props.primaryColor - Brand color for links
 */
export function IdeaSummaryCard({
  title,
  url,
  status = null,
  authorName = null,
  commentCount = null,
  voteCount = null,
  timeSavedMinutes = null,
  updateText = null,
  primaryColor = theme.colors.primary,
}) {
  const statusStyle = status ? getStatusStyle(status) : null;

  // Format time saved
  const formatTimeSaved = (minutes) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const hasMeta =
    authorName ||
    (commentCount !== null && commentCount > 0) ||
    (voteCount !== null && voteCount > 0) ||
    timeSavedMinutes;

  return (
    <table style={styles.card} cellPadding="0" cellSpacing="0">
      <tbody>
        <tr>
          <td style={styles.content}>
            {/* Title with optional status badge (single row, status width:1%) */}
            <table cellPadding="0" cellSpacing="0" style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={styles.titleCell}>
                    <Link href={url} style={{ ...styles.title, color: primaryColor }}>
                      {title}
                    </Link>
                  </td>
                  {status && (
                    <td style={styles.statusCell}>
                      <Text
                        style={{
                          ...styles.statusBadge,
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.text,
                        }}
                      >
                        {status}
                      </Text>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>

            {/* Metadata row */}
            {hasMeta && (
              <Text style={styles.meta}>
                {authorName && <span>By {authorName}</span>}
                {commentCount !== null && commentCount > 0 && (
                  <span>
                    {authorName ? " | " : ""}
                    {"\uD83D\uDCAC"} {commentCount}
                  </span>
                )}
                {voteCount !== null && voteCount > 0 && (
                  <span>
                    {authorName || commentCount ? " | " : ""}
                    {"\uD83D\uDC4D"} {voteCount}
                  </span>
                )}
                {timeSavedMinutes && (
                  <span style={{ color: theme.colors.success }}>
                    {authorName || commentCount || voteCount ? " | " : ""}
                    {"\u23F1"} {formatTimeSaved(timeSavedMinutes)} saved
                  </span>
                )}
              </Text>
            )}

            {/* Optional update text */}
            {updateText && <Text style={styles.update}>{updateText}</Text>}

            {/* View link, right-aligned, on its own row so the title gets the
                full width above. Stacks cleanly on narrow viewports. */}
            <Text style={styles.viewRow}>
              <Link href={url} style={{ ...styles.viewLink, color: primaryColor }}>
                View {"\u2192"}
              </Link>
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * IdeaSummaryList - Container for multiple IdeaSummaryCards
 *
 * @param {Object} props
 * @param {string} props.title - Section title (optional)
 * @param {string} props.icon - Emoji icon for section (optional)
 * @param {React.ReactNode} props.children - IdeaSummaryCard components
 */
export function IdeaSummaryList({ title = null, icon = null, children }) {
  return (
    <table style={styles.list} cellPadding="0" cellSpacing="0">
      <tbody>
        {title && (
          <tr>
            <td style={styles.listHeader}>
              <Text style={styles.listTitle}>
                {icon && <span style={styles.listIcon}>{icon}</span>}
                {title}
              </Text>
            </td>
          </tr>
        )}
        {React.Children.map(children, (child, index) => (
          <tr key={index}>
            <td style={styles.listItem}>{child}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const styles = {
  list: {
    width: "100%",
  },
  listHeader: {
    paddingBottom: theme.spacing.md,
  },
  listTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: "0",
  },
  listIcon: {
    marginRight: theme.spacing.sm,
  },
  listItem: {
    paddingBottom: theme.spacing.sm,
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.borderLight}`,
  },
  content: {
    padding: theme.spacing.md,
    verticalAlign: "top",
  },
  titleCell: {
    paddingRight: theme.spacing.sm,
    verticalAlign: "top",
  },
  statusCell: {
    width: "1%",
    textAlign: "right",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  statusBadge: {
    display: "inline-block",
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.md,
    margin: "0",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  title: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecoration: "none",
    display: "block",
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  meta: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
  update: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    fontStyle: "italic",
    margin: `${theme.spacing.xs} 0 0 0`,
  },
  viewRow: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textAlign: "right",
    margin: `${theme.spacing.sm} 0 0 0`,
  },
  viewLink: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    textDecoration: "none",
  },
};

export default IdeaSummaryCard;
