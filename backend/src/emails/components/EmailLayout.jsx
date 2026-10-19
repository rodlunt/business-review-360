import { Html, Head, Body, Container, Preview, Font } from "@react-email/components";
import { theme } from "../styles/theme.js";

/**
 * EmailLayout - Main wrapper component for all email templates
 *
 * Provides consistent structure, styling, and responsive design
 * for all email templates.
 *
 * @param {Object} props
 * @param {string} props.preview - Preview text shown in email clients
 * @param {React.ReactNode} props.children - Email content
 */
export function EmailLayout({ preview, children }) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Arial"
          fallbackFontFamily="Helvetica"
          fontWeight={400}
          fontStyle="normal"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body style={styles.body}>
        <Container style={styles.container}>{children}</Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: theme.colors.background,
    fontFamily: theme.typography.fontFamily,
    margin: "0",
    padding: "0",
    WebkitTextSizeAdjust: "100%",
    MsTextSizeAdjust: "100%",
  },
  container: {
    maxWidth: theme.dimensions.maxWidth,
    margin: "0 auto",
    padding: theme.spacing.lg,
  },
};

export default EmailLayout;
