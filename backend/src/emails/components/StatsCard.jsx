import { Text } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * StatsCard - Reusable card component for displaying statistics
 *
 * Used in digest emails to display metrics in a visually appealing way.
 *
 * @param {Object} props
 * @param {string} props.icon - Emoji icon to display
 * @param {string|number} props.value - The main statistic value
 * @param {string} props.label - Label describing the statistic
 * @param {string} props.trend - Trend indicator (e.g., "+20%", "-5%")
 * @param {boolean} props.trendPositive - Whether the trend is positive
 * @param {string} props.primaryColor - Brand color for accents
 */
export function StatsCard({
  icon = null,
  value,
  label,
  trend = null,
  trendPositive = true,
  primaryColor = theme.colors.primary,
}) {
  return (
    <td style={styles.cardCell}>
      <table style={styles.card} cellPadding="0" cellSpacing="0">
        <tbody>
          <tr>
            <td style={styles.cardContent}>
              {icon && <Text style={styles.icon}>{icon}</Text>}
              <Text style={{ ...styles.value, color: primaryColor }}>{value}</Text>
              <Text style={styles.label}>{label}</Text>
              {trend && (
                <Text
                  style={{
                    ...styles.trend,
                    color: trendPositive ? theme.colors.success : theme.colors.error,
                  }}
                >
                  {trend}
                </Text>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </td>
  );
}

/**
 * StatsRow - Container for multiple StatsCards in a row
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - StatsCard components
 */
export function StatsRow({ children }) {
  return (
    <table style={styles.row} cellPadding="0" cellSpacing="0">
      <tbody>
        <tr>{children}</tr>
      </tbody>
    </table>
  );
}

const styles = {
  row: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: theme.spacing.sm,
  },
  cardCell: {
    verticalAlign: "top",
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.borderRadius.lg,
    textAlign: "center",
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  icon: {
    fontSize: "24px",
    margin: `0 0 ${theme.spacing.xs} 0`,
    lineHeight: "1",
  },
  value: {
    fontSize: theme.typography.fontSize["2xl"],
    fontWeight: theme.typography.fontWeight.bold,
    margin: `0 0 ${theme.spacing.xs} 0`,
    lineHeight: "1.2",
  },
  label: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: "0",
    lineHeight: "1.4",
  },
  trend: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    margin: `${theme.spacing.xs} 0 0 0`,
  },
};

export default StatsCard;
