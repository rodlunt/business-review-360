import { Hr } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * Divider - Horizontal divider component
 *
 * Visual separator for content sections.
 *
 * @param {Object} props
 * @param {string} props.color - Border color
 * @param {string} props.margin - Margin size ('sm' | 'md' | 'lg' | 'xl')
 */
export function Divider({ color = theme.colors.border, margin = "lg" }) {
  const marginValue = theme.spacing[margin] || theme.spacing.lg;

  return (
    <Hr
      style={{
        borderColor: color,
        borderTop: `1px solid ${color}`,
        margin: `${marginValue} 0`,
      }}
    />
  );
}

export default Divider;
