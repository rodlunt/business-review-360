import { Text } from "@react-email/components";
import { EmailLayout } from "../../components/EmailLayout.jsx";
import { Header } from "../../components/Header.jsx";
import { Footer } from "../../components/Footer.jsx";
import { Button } from "../../components/Button.jsx";
import { Section } from "../../components/Section.jsx";
import { Divider } from "../../components/Divider.jsx";
import { theme } from "../../styles/theme.js";

/**
 * AdminUserPendingApproval Template
 *
 * Sent to admins when a new user registers and requires approval.
 *
 * @param {Object} props
 * @param {string} props.adminName - Admin's name (optional)
 * @param {string} props.newUserName - New user's username
 * @param {string} props.newUserEmail - New user's email
 * @param {string} props.registeredAt - Registration timestamp
 * @param {string} props.organizationName - Organization display name
 * @param {string} props.primaryColor - Organization brand color
 * @param {string} props.logoUrl - Organization logo URL (optional)
 * @param {string} props.adminUrl - URL to admin user management page
 */
export function AdminUserPendingApproval({
  adminName = null,
  newUserName,
  newUserEmail,
  registeredAt = null,
  organizationName = "Business Review 360",
  primaryColor = theme.colors.primary,
  logoUrl = null,
  adminUrl,
}) {
  const previewText = `New user registration pending approval: ${newUserName}`;
  const formattedTime = registeredAt
    ? new Date(registeredAt).toLocaleString("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Australia/Sydney",
      })
    : "just now";

  return (
    <EmailLayout preview={previewText}>
      <Header organizationName={organizationName} primaryColor={primaryColor} logoUrl={logoUrl} />

      <Section>
        <Text style={styles.heading}>New User Registration Pending Approval</Text>

        <Text style={styles.paragraph}>{adminName ? `Hi ${adminName},` : "Hello Admin,"}</Text>

        <Text style={styles.paragraph}>
          A new user has registered for {organizationName} and requires your approval before they
          can access the platform.
        </Text>

        <Section backgroundColor={theme.colors.backgroundLight} padding="md">
          <Text style={styles.detailLabel}>Username</Text>
          <Text style={styles.detailValue}>{newUserName}</Text>

          <Text style={styles.detailLabel}>Email</Text>
          <Text style={styles.detailValue}>{newUserEmail}</Text>

          <Text style={styles.detailLabel}>Registered</Text>
          <Text style={styles.detailValue}>{formattedTime}</Text>
        </Section>

        <Section center padding="md">
          <Button href={adminUrl} color={primaryColor}>
            Review & Approve User
          </Button>
        </Section>

        <Divider margin="lg" />

        <Text style={styles.infoText}>
          You can approve or reject this user in the User Management section of Admin Settings.
        </Text>

        <Text style={styles.infoText}>
          If you don't recognize this registration request, you can safely reject it.
        </Text>
      </Section>

      <Footer organizationName={organizationName} showUnsubscribe={false} />
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
  detailLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    margin: `0 0 ${theme.spacing.xs} 0`,
  },
  detailValue: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    margin: `0 0 ${theme.spacing.md} 0`,
  },
  infoText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    margin: `0 0 ${theme.spacing.sm} 0`,
  },
};

export default AdminUserPendingApproval;
