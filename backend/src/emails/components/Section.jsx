import { Section as ReactEmailSection } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * Section - Content section component
 *
 * Provides consistent spacing and styling for content sections.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Section content
 * @param {string} props.backgroundColor - Background color
 * @param {string} props.padding - Padding size ('none' | 'sm' | 'md' | 'lg' | 'xl')
 * @param {boolean} props.center - Whether to center text content
 */
export function Section({
  children,
  backgroundColor = theme.colors.backgroundWhite,
  padding = "lg",
  center = false,
}) {
  const paddingValue = padding === "none" ? "0" : theme.spacing[padding] || theme.spacing.lg;

  return (
    <ReactEmailSection
      style={{
        ...styles.section,
        backgroundColor,
        padding: paddingValue,
        textAlign: center ? "center" : "left",
      }}
    >
      {children}
    </ReactEmailSection>
  );
}

const styles = {
  section: {
    width: "100%",
  },
};

export default Section;
