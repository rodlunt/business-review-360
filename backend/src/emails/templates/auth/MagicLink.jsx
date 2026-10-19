import { Text, Link } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * MagicLink Email Template
 *
 * #892: sent when a visitor requests guest access via a one-time sign-in
 * link. Redeeming the link (a single explicit click, not the email open
 * itself) creates a real account in the shared demo-corp sandbox if one
 * does not already exist for the address.
 *
 * @param {Object} props
 * @param {string} props.magicLinkUrl - Frontend URL carrying the token
 * @param {number} props.expirationMinutes - Link expiration time in minutes
 */
export function MagicLink({ magicLinkUrl, expirationMinutes = 15 }) {
  const previewText = "Your Business Review 360 sign-in link";

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="Business Review 360" primaryColor={theme.colors.primary} />

      <Section>
        <Text style={styles.heading}>Your sign-in link</Text>

        <Text style={styles.paragraph}>Hello,</Text>

        <Text style={styles.paragraph}>
          Use the button below to sign in as a guest and explore the Business Review 360 demo
          workspace. No password needed.
        </Text>

        <Section center padding="md">
          <Button href={magicLinkUrl} color={theme.colors.primary}>
            Continue as guest
          </Button>
        </Section>

        <Text style={styles.paragraphSmall}>Or copy and paste this link into your browser:</Text>

        <Text style={styles.linkText}>
          <Link href={magicLinkUrl} style={{ color: theme.colors.primary }}>
            {magicLinkUrl}
          </Link>
        </Text>

        <Divider margin="lg" />

        <Text style={styles.securityNotice}>
          If you did not request this link, you can safely ignore this email. No account will be
          created unless the link above is used.
        </Text>

        <Text style={styles.expirationNotice}>
          This link will expire in {expirationMinutes}{" "}
          {expirationMinutes === 1 ? "minute" : "minutes"}.
        </Text>
      </Section>

      <Footer organizationName="Business Review 360" showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  heading: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  paragraph: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  paragraphSmall: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `${theme.spacing.md} 0 ${theme.spacing.xs} 0`,
  },
  linkText: {
    fontSize: theme.typography.fontSize.sm,
    wordBreak: "break-all",
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  securityNotice: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
  expirationNotice: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    margin: "0",
  },
};

export default MagicLink;
