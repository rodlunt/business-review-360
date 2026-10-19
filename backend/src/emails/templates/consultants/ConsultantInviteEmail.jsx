import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * ConsultantInviteEmail
 *
 * Personal invite from Rodney to a business coach.
 * Explains what BR360 is, how it supports coaching work,
 * the referral arrangement, and the CTA to complete their profile.
 *
 * @param {Object} props
 * @param {string} props.firstName
 * @param {string} props.signupUrl - Invite URL including the token
 * @param {number} props.commissionPct - Commission percentage (e.g. 30)
 */
export function ConsultantInviteEmail({ firstName = "there", signupUrl, commissionPct = 30 }) {
  const previewText = "An invitation to join BR360 as a consultant partner";

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName="BusinessReview360" primaryColor={theme.colors.primary} />

      <Section>
        <Text style={styles.heading}>An invitation for you</Text>

        <Text style={styles.paragraph}>Hi {firstName},</Text>

        <Text style={styles.paragraph}>
          I wanted to reach out personally with something I think could genuinely add value to your
          coaching practice.
        </Text>

        <Divider margin="lg" />

        <Text style={styles.sectionLabel}>WHAT BR360 IS</Text>

        <Text style={styles.paragraph}>
          BusinessReview360 is a continuous business review platform. It gives every person in a
          business a structured way to submit ideas, vote on what matters most, and see what
          leadership is doing about it.
        </Text>

        <Text style={styles.paragraph}>
          The premise is simple: the people already inside a business usually know what needs to
          change. They see the inefficiencies, the missed opportunities, the friction points. They
          just need a way to be heard, and a leader who can act on what surfaces.
        </Text>

        <Divider margin="lg" />

        <Text style={styles.sectionLabel}>WHY IT MATTERS FOR YOUR CLIENTS</Text>

        <Text style={styles.paragraph}>
          As a business coach, you help clients get results. BR360 makes that easier.
        </Text>

        <Text style={styles.paragraph}>
          When your client installs BR360, their team starts surfacing ideas from day one. By the
          time you walk into your next session together, there&apos;s already a prioritised list of
          what the business knows it needs to work on, coming directly from the people who know it
          best. You spend less time diagnosing and more time driving results.
        </Text>

        <Text style={styles.paragraph}>
          Between engagements, it keeps the momentum going. Staff stay engaged, ideas keep flowing,
          and your client can point to real progress instead of waiting for the next workshop.
        </Text>

        <Divider margin="lg" />

        <Text style={styles.sectionLabel}>THE REFERRAL ARRANGEMENT</Text>

        <Text style={styles.paragraph}>
          When you refer a client to BR360 using your unique link and they sign up, you earn{" "}
          <strong>{commissionPct}%</strong> of their monthly subscription fee for as long as they
          remain a customer.
        </Text>

        <Text style={styles.paragraph}>
          Payment is simple: you invoice me monthly for the amount owed, I pay it. No third-party
          platforms, no held banking details, just a direct arrangement between us.
        </Text>

        <Divider margin="lg" />

        <Text style={styles.paragraph}>
          Click below to complete your profile and get your referral link. It takes a couple of
          minutes and the link is yours immediately.
        </Text>

        <Section center padding="md">
          <Button href={signupUrl} color={theme.colors.primary}>
            Complete your profile
          </Button>
        </Section>

        <Text style={styles.paragraphSmall}>
          This link expires in 7 days. If you&apos;d like to talk it through first, feel free to
          shoot me an email or give me a call.
        </Text>

        <Divider margin="lg" />

        <Text style={styles.signature}>
          Rodney Lunt{"\n"}
          0450 112 883
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
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  signature: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.lineHeight.normal,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.bold,
    whiteSpace: "pre-line",
    margin: `0 0 ${theme.spacing.md} 0`,
  },
};

export default ConsultantInviteEmail;
