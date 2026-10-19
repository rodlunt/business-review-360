import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * ConsultantWelcomeEmail: "Next Steps" email sent when a consultant completes signup.
 *
 * @param {Object} props
 * @param {string} props.firstName
 * @param {string} props.email - Consultant's email (also their demo login username)
 * @param {string} props.referralUrl - The consultant's unique referral URL
 * @param {number} props.commissionPct - Commission percentage (e.g. 30)
 * @param {string|null} props.demoResetUrl - 48-hour password-reset link for the demo account
 * @param {string} props.demoLoginUrl - Demo environment URL (after password is set)
 */
export function ConsultantWelcomeEmail({
  firstName = "there",
  email = "",
  referralUrl,
  commissionPct = 30,
  demoResetUrl = null,
  demoLoginUrl = "https://demo-corp.br360.example.com/review",
}) {
  const previewText = "Welcome to BR360: your referral link and next steps";

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="BusinessReview360" primaryColor={theme.colors.primary} />

      <Section>
        <Text style={styles.heading}>Welcome to BR360, {firstName}</Text>

        <Text style={styles.paragraph}>
          You&apos;re all set. Here&apos;s everything you need to get started.
        </Text>

        <Divider margin="md" />

        {/* Section 1: Referral link */}
        <Text style={styles.sectionLabel}>YOUR REFERRAL LINK</Text>

        <Text style={styles.paragraph}>Share this link with clients:</Text>

        <Section center padding="md">
          <Button href={referralUrl} color={theme.colors.primary}>
            {referralUrl}
          </Button>
        </Section>

        <Text style={styles.paragraph}>
          You&apos;ll earn {commissionPct}% of each referred client&apos;s monthly subscription for
          as long as they remain a customer.
        </Text>

        {demoResetUrl && (
          <>
            <Divider margin="lg" />

            {/* Section 2: Set up demo account */}
            <Text style={styles.sectionLabel}>SET UP YOUR DEMO ACCOUNT</Text>

            <Text style={styles.paragraph}>
              We&apos;ve created a BR360 admin account on our demo environment so you can explore
              the platform first-hand before showing it to clients.
            </Text>

            <Text style={styles.paragraph}>
              Your login username is your email address: <strong>{email}</strong>
            </Text>

            <Section center padding="md">
              <Button href={demoResetUrl} color={theme.colors.primary}>
                Set your password
              </Button>
            </Section>

            <Text style={styles.paragraphSmall}>
              This link expires in 48 hours. If it expires, use the &quot;Forgot password&quot; link
              on the demo login page.
            </Text>

            <Divider margin="lg" />

            {/* Section 3: Demo environment info */}
            <Text style={styles.sectionLabel}>YOUR DEMO ENVIRONMENT</Text>

            <Text style={styles.paragraph}>Once your password is set, log in at:</Text>

            <Section center padding="md">
              <Button href={demoLoginUrl} color={theme.colors.primary}>
                Open demo environment
              </Button>
            </Section>

            <Text style={styles.paragraph}>
              You have full admin access. Demo data (ideas, categories) resets each night so the
              board is always representative. Your account and referral link are permanent and will
              never be reset.
            </Text>
          </>
        )}

        <Divider margin="lg" />

        <Text style={styles.paragraphSmall}>
          Questions? Reply to this email and we&apos;ll get back to you.
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
  sectionLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
    letterSpacing: "0.08em",
    margin: `0 0 ${theme.spacing.sm} 0`,
    textTransform: "uppercase",
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

export default ConsultantWelcomeEmail;
