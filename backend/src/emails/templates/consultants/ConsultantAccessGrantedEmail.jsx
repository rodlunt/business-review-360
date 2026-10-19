import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * ConsultantAccessGrantedEmail
 *
 * Sent to a consultant when a referred client signs up AND grants them
 * admin access to their organisation.
 *
 * @param {Object} props
 * @param {string} props.firstName        - Consultant's first name
 * @param {string} props.orgName          - Name of the client organisation
 * @param {string} props.orgSubdomainUrl  - Full subdomain URL for the client org
 */
export function ConsultantAccessGrantedEmail({
  firstName = "there",
  orgName = "your new client",
  orgSubdomainUrl,
}) {
  const previewText = `${orgName} has joined BR360 and granted you access`;

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="BusinessReview360" primaryColor={theme.colors.primary} />

      <Section>
        <Text style={styles.heading}>{orgName} has joined BR360</Text>

        <Text style={styles.paragraph}>Hi {firstName},</Text>

        <Text style={styles.paragraph}>
          {orgName} signed up via your referral link and has granted you admin access to their
          organisation. You can log in and view their analytics and ideas straight away.
        </Text>

        <Text style={styles.paragraph}>
          You will also earn commission on their subscription for as long as they remain a customer.
        </Text>

        {orgSubdomainUrl && (
          <Section center padding="md">
            <Button href={orgSubdomainUrl} color={theme.colors.primary}>
              View {orgName}
            </Button>
          </Section>
        )}

        <Divider margin="lg" />

        <Text style={styles.paragraphSmall}>
          Questions? Reply to this email and we will get back to you.
        </Text>
      </Section>

      <Footer organizationName="BusinessReview360" showUnsubscribe={false} />
    </EmailLayout>
  );
}

const styles = {
  heading: {
    fontSize: theme.typography.fontSize["2xl"],
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
    margin: `${theme.spacing.md} 0`,
  },
};

export default ConsultantAccessGrantedEmail;
