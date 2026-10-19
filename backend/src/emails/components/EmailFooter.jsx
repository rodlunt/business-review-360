/**
 * EmailFooter Component
 *
 * Reusable footer for all emails with unsubscribe links.
 * CAN-SPAM and GDPR compliant.
 *
 * Issue #447: Unsubscribe system implementation
 */

import { Section, Text, Link, Hr } from "@react-email/components";

/**
 * Email Footer with unsubscribe links
 *
 * @param {object} props
 * @param {string} props.organizationName - Organization name
 * @param {string} props.organizationColor - Primary color
 * @param {string} props.unsubscribeAllUrl - Global unsubscribe URL
 * @param {string} props.unsubscribeTypeUrl - Per-type unsubscribe URL
 * @param {string} props.unsubscribeTypeName - Name of the notification type
 * @param {string} props.unsubscribeIdeaUrl - Per-idea unsubscribe URL (optional)
 * @param {string} props.ideaTitle - Idea title for context (optional)
 * @param {string} props.preferencesUrl - Notification preferences URL
 * @param {string} props.privacyPolicyUrl - Privacy policy URL (optional)
 * @param {string} props.organizationAddress - Physical address for CAN-SPAM (optional)
 */
export function EmailFooter({
  organizationName = "Business Review 360",
  _organizationColor = "#1976d2",
  unsubscribeAllUrl,
  unsubscribeTypeUrl,
  unsubscribeTypeName,
  unsubscribeIdeaUrl,
  ideaTitle,
  preferencesUrl,
  privacyPolicyUrl,
  organizationAddress,
}) {
  return (
    <Section style={styles.footer}>
      <Hr style={styles.divider} />

      {/* Idea-specific unsubscribe */}
      {unsubscribeIdeaUrl && (
        <Text style={styles.unsubscribeText}>
          <Link href={unsubscribeIdeaUrl} style={styles.link}>
            Unsubscribe from "{ideaTitle || "this idea"}"
          </Link>
        </Text>
      )}

      {/* Type-specific unsubscribe */}
      {unsubscribeTypeUrl && unsubscribeTypeName && (
        <Text style={styles.unsubscribeText}>
          <Link href={unsubscribeTypeUrl} style={styles.link}>
            Unsubscribe from {unsubscribeTypeName}
          </Link>
        </Text>
      )}

      {/* Preferences and global unsubscribe */}
      <Text style={styles.linksText}>
        <Link href={preferencesUrl} style={styles.link}>
          Email Preferences
        </Link>
        {" | "}
        <Link href={unsubscribeAllUrl} style={styles.link}>
          Unsubscribe from all emails
        </Link>
      </Text>

      <Hr style={styles.dividerLight} />

      {/* Organization info */}
      <Text style={styles.orgName}>{organizationName}</Text>

      {/* Physical address (CAN-SPAM requirement) */}
      {organizationAddress && <Text style={styles.address}>{organizationAddress}</Text>}

      {/* Legal links */}
      <Text style={styles.legalText}>
        {privacyPolicyUrl && (
          <>
            <Link href={privacyPolicyUrl} style={styles.legalLink}>
              Privacy Policy
            </Link>
            {" | "}
          </>
        )}
        <Link href="https://br360.example.com" style={styles.legalLink}>
          Business Review 360
        </Link>
      </Text>

      {/* Copyright */}
      <Text style={styles.copyright}>
        © {new Date().getFullYear()} {organizationName}. All rights reserved.
      </Text>
    </Section>
  );
}

/**
 * Minimal footer for transactional emails (password reset, etc.)
 * These emails don't have unsubscribe links as they're critical.
 */
export function TransactionalEmailFooter({ organizationName = "Business Review 360" }) {
  return (
    <Section style={styles.footer}>
      <Hr style={styles.divider} />

      <Text style={styles.transactionalNote}>
        This is a transactional email required for your account. You cannot unsubscribe from these
        notifications.
      </Text>

      <Text style={styles.orgName}>{organizationName}</Text>

      <Text style={styles.copyright}>
        © {new Date().getFullYear()} {organizationName}. All rights reserved.
      </Text>
    </Section>
  );
}

const styles = {
  footer: {
    textAlign: "center",
    padding: "24px 20px",
    marginTop: "32px",
    backgroundColor: "#fafafa",
    borderTop: "1px solid #e0e0e0",
  },
  divider: {
    borderColor: "#e0e0e0",
    margin: "0 0 20px 0",
  },
  dividerLight: {
    borderColor: "#eeeeee",
    margin: "16px 0",
  },
  unsubscribeText: {
    fontSize: "13px",
    color: "#666666",
    margin: "8px 0",
    lineHeight: "20px",
  },
  linksText: {
    fontSize: "13px",
    color: "#666666",
    margin: "12px 0",
    lineHeight: "20px",
  },
  link: {
    color: "#1976d2",
    textDecoration: "underline",
  },
  orgName: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#333333",
    margin: "8px 0",
  },
  address: {
    fontSize: "12px",
    color: "#999999",
    margin: "4px 0",
    lineHeight: "18px",
  },
  legalText: {
    fontSize: "11px",
    color: "#999999",
    margin: "12px 0 4px 0",
  },
  legalLink: {
    color: "#999999",
    textDecoration: "underline",
  },
  copyright: {
    fontSize: "11px",
    color: "#cccccc",
    margin: "4px 0",
  },
  transactionalNote: {
    fontSize: "11px",
    color: "#999999",
    fontStyle: "italic",
    margin: "8px 0 16px 0",
    lineHeight: "16px",
  },
};

export default EmailFooter;
