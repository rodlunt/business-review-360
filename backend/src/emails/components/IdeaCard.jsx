import { Section, Text, Link } from "@react-email/components";
import { theme, getStatusStyle } from "../styles/theme.js";

/**
 * IdeaCard - Reusable card component for displaying idea information
 *
 * Used in notification emails to display idea details consistently.
 *
 * @param {Object} props
 * @param {string} props.title - Idea title
 * @param {string} props.description - Idea description (optional, will be truncated)
 * @param {string} props.status - Idea status
 * @param {string} props.author - Author name (optional)
 * @param {string} props.category - Category name (optional)
 * @param {number} props.timeSaved - Time saved in minutes (optional)
 * @param {string} props.ideaUrl - URL to view the idea
 * @param {string} props.primaryColor - Brand color for link
 */
export function IdeaCard({
  title,
  description = null,
  status = null,
  author = null,
  category = null,
  timeSaved = null,
  ideaUrl = null,
  primaryColor = theme.colors.primary,
}) {
  const statusStyle = status ? getStatusStyle(status) : null;
  const truncatedDescription = description
    ? description.length > 150
      ? description.substring(0, 150) + "..."
      : description
    : null;

  return (
    <Section style={styles.card}>
      {/* Status badge */}
      {status && (
        <Text style={styles.statusBadgeContainer}>
          <span
            style={{
              ...styles.statusBadge,
              backgroundColor: statusStyle.bg,
              color: statusStyle.text,
              border: `1px solid ${statusStyle.border}`,
            }}
          >
            {status}
          </span>
        </Text>
      )}

      {/* Title */}
      {ideaUrl ? (
        <Link href={ideaUrl} style={{ ...styles.title, color: primaryColor }}>
          {title}
        </Link>
      ) : (
        <Text style={styles.titleText}>{title}</Text>
      )}

      {/* Metadata row */}
      {(author || category || timeSaved) && (
        <Text style={styles.metadata}>
          {author && <span>By {author}</span>}
          {author && category && <span> | </span>}
          {category && <span>{category}</span>}
          {(author || category) && timeSaved && <span> | </span>}
          {timeSaved && <span>{timeSaved} min saved</span>}
        </Text>
      )}

      {/* Description */}
      {truncatedDescription && <Text style={styles.description}>{truncatedDescription}</Text>}
    </Section>
  );
}

const styles = {
  card: {
    backgroundColor: theme.colors.backgroundWhite,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    margin: `${theme.spacing.md} 0`,
  },
  statusBadgeContainer: {
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  statusBadge: {
    display: "inline-block",
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    borderRadius: theme.borderRadius.md,
    textTransform: "uppercase",
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    textDecoration: "none",
    display: "block",
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  titleText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  metadata: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeight.normal,
    margin: "0",
  },
};

export default IdeaCard;
