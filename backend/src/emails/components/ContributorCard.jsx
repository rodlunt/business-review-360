import React from "react";
import { Text } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * ContributorCard - Card component for displaying top contributors
 *
 * Used in digest emails to highlight active users.
 *
 * @param {Object} props
 * @param {number} props.rank - Contributor rank (1, 2, 3, etc.)
 * @param {string} props.name - Contributor's name
 * @param {number} props.ideasCount - Number of ideas submitted
 * @param {number} props.commentsCount - Number of comments made
 * @param {number} props.implementedCount - Number of ideas implemented (optional)
 * @param {string} props.primaryColor - Brand color for accents
 */
export function ContributorCard({
  rank,
  name,
  ideasCount = 0,
  commentsCount = 0,
  implementedCount = null,
  primaryColor = theme.colors.primary,
}) {
  // Medal emoji for top 3
  const getMedal = (rank) => {
    switch (rank) {
      case 1:
        return "\uD83E\uDD47"; // Gold medal
      case 2:
        return "\uD83E\uDD48"; // Silver medal
      case 3:
        return "\uD83E\uDD49"; // Bronze medal
      default:
        return null;
    }
  };

  const medal = getMedal(rank);

  return (
    <table style={styles.card} cellPadding="0" cellSpacing="0">
      <tbody>
        <tr>
          <td style={styles.rankCell}>
            {medal ? (
              <Text style={styles.medal}>{medal}</Text>
            ) : (
              <Text style={{ ...styles.rank, backgroundColor: primaryColor }}>{rank}</Text>
            )}
          </td>
          <td style={styles.infoCell}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.stats}>
              {ideasCount > 0 && (
                <span>
                  {ideasCount} idea{ideasCount !== 1 ? "s" : ""}
                </span>
              )}
              {ideasCount > 0 && commentsCount > 0 && <span>, </span>}
              {commentsCount > 0 && (
                <span>
                  {commentsCount} comment{commentsCount !== 1 ? "s" : ""}
                </span>
              )}
              {implementedCount !== null && implementedCount > 0 && (
                <span style={{ color: theme.colors.success }}>
                  {" "}
                  ({implementedCount} implemented)
                </span>
              )}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * ContributorList - Container for multiple ContributorCards
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - ContributorCard components
 */
export function ContributorList({ children }) {
  return (
    <table style={styles.list} cellPadding="0" cellSpacing="0">
      <tbody>
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
  listItem: {
    paddingBottom: theme.spacing.sm,
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  rankCell: {
    width: "48px",
    verticalAlign: "middle",
    paddingRight: theme.spacing.md,
  },
  medal: {
    fontSize: "28px",
    margin: "0",
    lineHeight: "1",
    textAlign: "center",
  },
  rank: {
    color: "#ffffff",
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    width: "32px",
    height: "32px",
    lineHeight: "32px",
    textAlign: "center",
    borderRadius: theme.borderRadius.full,
    margin: "0",
  },
  infoCell: {
    verticalAlign: "middle",
  },
  name: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  stats: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
  },
};

export default ContributorCard;
