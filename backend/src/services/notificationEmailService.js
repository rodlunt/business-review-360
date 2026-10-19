/**
 * Notification Email Service
 *
 * Centralised wrappers for all transactional notification emails. Replaces
 * the deprecated `backend/src/utils/mailer.js` module (issue #708): same
 * public API, same call signatures, but routed through the email queue
 * (`enqueueTemplateEmail`) and the React Email template registry. The queue
 * worker drains every minute (emailQueueWorker.js) and surfaces send failures
 * as `EmailQueue.status='failed'` after retry budget exhaustion (#738).
 *
 * Each export below preserves the shape that the route handlers in
 * `backend/src/routes/{auth,users,ideas,comments}.js` already use, so the
 * migration is import-only on the caller side.
 *
 * Notification preference checks (per-user opt-out, per-idea subscription,
 * admin digest preferences) are honoured here exactly as they were in
 * `mailer.js` so behaviour is unchanged from the caller's perspective.
 */

import { enqueueTemplateEmail, EmailPriority } from "./emailQueueService.js";
import {
  NotificationType,
  shouldSendNotification,
  shouldSendIdeaNotification,
} from "../utils/notificationChecker.js";
import { logger } from "../utils/logger.js";

/**
 * Dynamically import a React Email template by relative path so the import
 * happens at call time rather than module-load time. This mirrors the
 * loadTemplate strategy from the deleted `utils/mailer.js` and is required
 * because the Jest config remaps `.jsx` to the React jsx-runtime stub:
 * static named imports from `.jsx` files would resolve to `undefined`
 * under tests that transitively load this module via routes that mock it
 * (auth.js, ideas.js, comments.js, users.js).
 *
 * @param {string} categoryDir - 'auth' | 'notifications' | 'admin'
 * @param {string} templateName - Filename stem, e.g. 'PasswordReset'
 */
async function loadTemplate(categoryDir, templateName) {
  const module = await import(`../emails/templates/${categoryDir}/${templateName}.jsx`);
  return module[templateName] || module.default;
}

const DEFAULT_ORG_NAME = "Business Review 360";
const DEFAULT_PRIMARY_COLOR = "#1976d2";

function baseUrl() {
  return process.env.FRONTEND_URL || "http://localhost:3000";
}

function brandingFor(organization) {
  return {
    organizationName: organization?.organizationName || DEFAULT_ORG_NAME,
    primaryColor: organization?.primaryColor || DEFAULT_PRIMARY_COLOR,
    logoUrl: organization?.logoUrl || null,
  };
}

/**
 * Send a password reset email.
 *
 * @param {string} to - Recipient email address
 * @param {string} token - Password reset token (raw, not hashed)
 * @param {string} organizationId - Organisation ID (slug or UUID)
 * @param {Object} [organization] - Optional organisation object with branding
 */
export async function sendPasswordResetEmail(to, token, organizationId, organization = null) {
  if (!organizationId) {
    throw new Error("Organisation ID is required for password reset emails");
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const resetUrl = `${baseUrl()}/org/${organizationId}/reset-password?token=${token}`;

  logger.info("[NotificationEmail] Sending password reset email", {
    to,
    organizationId,
    organizationName,
  });

  return enqueueTemplateEmail({
    to,
    subject: `${organizationName} - Password Reset`,
    template: await loadTemplate("auth", "PasswordReset"),
    templateProps: {
      resetUrl,
      organizationName,
      primaryColor,
      logoUrl,
      expirationMinutes: 60,
    },
    categories: ["password-reset", organizationId],
    type: "password-reset",
    priority: EmailPriority.CRITICAL,
    organizationId,
  });
}

/**
 * Send a magic-link guest-access email (#892).
 *
 * No organisation branding lookup: the link always lands the guest in the
 * shared demo-corp sandbox regardless of whether the email already belongs
 * to a User row elsewhere, so there is no per-tenant branding to resolve at
 * send time (unlike sendPasswordResetEmail, which requires organizationId).
 *
 * @param {string} to - Recipient email address
 * @param {string} token - Magic-link JWT (raw, not hashed)
 */
export async function sendMagicLinkEmail(to, token) {
  const demoOrgId = process.env.DEMO_ORG_ID || "demo-corp";
  const magicLinkUrl = `${baseUrl()}/auth/magic-link?token=${token}`;

  logger.info("[NotificationEmail] Sending magic link email", { to });

  return enqueueTemplateEmail({
    to,
    subject: `${DEFAULT_ORG_NAME} - Your sign-in link`,
    template: await loadTemplate("auth", "MagicLink"),
    templateProps: {
      magicLinkUrl,
      expirationMinutes: 15,
    },
    categories: ["magic-link"],
    type: "magic-link",
    priority: EmailPriority.CRITICAL,
    organizationId: demoOrgId,
  });
}

/**
 * Send an account setup email to a bulk-imported user.
 * Uses the same PasswordReset template with isSetup=true and a 48-hour link.
 */
export async function sendAccountSetupEmail(to, token, organizationId, organization = null) {
  if (!organizationId) {
    throw new Error("Organisation ID is required for account setup emails");
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const resetUrl = `${baseUrl()}/org/${organizationId}/reset-password?token=${token}`;

  logger.info("[NotificationEmail] Sending account setup email", {
    to,
    organizationId,
    organizationName,
  });

  return enqueueTemplateEmail({
    to,
    subject: `${organizationName} - Set Up Your Account`,
    template: await loadTemplate("auth", "PasswordReset"),
    templateProps: {
      resetUrl,
      organizationName,
      primaryColor,
      logoUrl,
      expirationMinutes: 2880,
      isSetup: true,
    },
    categories: ["account-setup", organizationId],
    type: "account-setup",
    priority: EmailPriority.CRITICAL,
    organizationId,
  });
}

/**
 * Send a team invite email to a bulk-imported user.
 * Tells the recipient the organisation has signed them up and prompts them to
 * set their password. Replaces sendAccountSetupEmail for bulk imports.
 *
 * @param {string} to - Recipient email address
 * @param {string} userName - Recipient's username (for personalised greeting)
 * @param {string} token - Password reset token (raw, not hashed)
 * @param {string} organizationId - Organisation ID (slug or UUID)
 * @param {Object} [organization] - Optional organisation object with branding
 * @param {Object} [opts] - Issue #865 bulk-import knobs (single-invite default = CRITICAL/now)
 * @param {number} [opts.priority] - EmailPriority override (BATCH for bulk imports)
 * @param {Date}   [opts.scheduledFor] - Defer queue pickup (used by bulk-import pacing)
 */
export async function sendTeamInviteEmail(
  to,
  userName,
  token,
  organizationId,
  organization = null,
  { priority = EmailPriority.CRITICAL, scheduledFor } = {}
) {
  if (!organizationId) {
    throw new Error("Organisation ID is required for team invite emails");
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const resetUrl = `${baseUrl()}/org/${organizationId}/reset-password?token=${token}`;

  logger.info("[NotificationEmail] Sending team invite email", {
    to,
    organizationId,
    organizationName,
    priority,
    scheduledFor: scheduledFor ? scheduledFor.toISOString() : "now",
  });

  return enqueueTemplateEmail({
    to,
    subject: `${organizationName} has signed you up - set up your account`,
    template: await loadTemplate("auth", "TeamInviteEmail"),
    templateProps: {
      userName,
      resetUrl,
      organizationName,
      primaryColor,
      logoUrl,
      expirationMinutes: 2880,
    },
    categories: ["team-invite", organizationId],
    type: "team-invite",
    priority,
    organizationId,
    ...(scheduledFor ? { scheduledFor } : {}),
  });
}

/**
 * Send a welcome email to a newly registered user.
 */
export async function sendWelcomeEmail(
  to,
  { userName, organizationId, organization, adminEmail = null }
) {
  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const url = baseUrl();

  logger.info("[NotificationEmail] Sending welcome email", { to, organizationId, userName });

  return enqueueTemplateEmail({
    to,
    subject: `Welcome to ${organizationName}!`,
    template: await loadTemplate("auth", "Welcome"),
    templateProps: {
      userName,
      organizationName,
      organizationId,
      primaryColor,
      logoUrl,
      loginUrl: `${url}/org/${organizationId}/login`,
      ideasUrl: `${url}/org/${organizationId}/ideas`,
      adminEmail,
    },
    categories: ["welcome", organizationId],
    type: "welcome",
    priority: EmailPriority.NORMAL,
    organizationId,
  });
}

/**
 * Send an email-verification email.
 */
export async function sendVerificationEmail(
  to,
  { userName, verificationToken, verificationCode, organizationId, organization }
) {
  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const url = baseUrl();

  logger.info("[NotificationEmail] Sending verification email", { to, organizationId });

  return enqueueTemplateEmail({
    to,
    subject: `Verify your email - ${organizationName}`,
    template: await loadTemplate("auth", "VerifyEmail"),
    templateProps: {
      userName,
      verificationUrl: `${url}/org/${organizationId}/verify-email?token=${verificationToken}`,
      verificationCode,
      organizationName,
      primaryColor,
      logoUrl,
      expirationHours: 24,
    },
    categories: ["verify-email", organizationId],
    type: "verify-email",
    priority: EmailPriority.HIGH,
    organizationId,
  });
}

/**
 * Send a "your password was changed" confirmation email.
 */
export async function sendPasswordChangedEmail(
  to,
  { userName, organizationId, organization, adminEmail = null }
) {
  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const url = baseUrl();

  logger.info("[NotificationEmail] Sending password changed email", { to, organizationId });

  return enqueueTemplateEmail({
    to,
    subject: `Password Changed - ${organizationName}`,
    template: await loadTemplate("auth", "PasswordChanged"),
    templateProps: {
      userName,
      organizationName,
      primaryColor,
      logoUrl,
      changeTimestamp: new Date().toISOString(),
      resetUrl: `${url}/org/${organizationId}/forgot-password`,
      adminEmail,
    },
    categories: ["password-changed", organizationId],
    type: "password-changed",
    priority: EmailPriority.HIGH,
    organizationId,
  });
}

/**
 * Notify an admin that a new user requires approval.
 */
export async function sendAdminUserPendingApprovalEmail(
  to,
  { adminName, newUserName, newUserEmail, organizationId, organization }
) {
  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const url = baseUrl();

  logger.info("[NotificationEmail] Sending admin pending approval email", {
    to,
    newUserName,
    organizationId,
  });

  return enqueueTemplateEmail({
    to,
    subject: `New User Pending Approval - ${organizationName}`,
    template: await loadTemplate("auth", "AdminUserPendingApproval"),
    templateProps: {
      adminName,
      newUserName,
      newUserEmail,
      registeredAt: new Date().toISOString(),
      organizationName,
      primaryColor,
      logoUrl,
      adminUrl: `${url}/org/${organizationId}/admin/settings`,
    },
    categories: ["admin-pending-approval", organizationId],
    type: "admin-pending-approval",
    priority: EmailPriority.HIGH,
    organizationId,
  });
}

/**
 * Notify a user that their account has been approved.
 */
export async function sendUserAccountApprovedEmail(to, { userName, organizationId, organization }) {
  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const url = baseUrl();

  logger.info("[NotificationEmail] Sending account approved email", {
    to,
    userName,
    organizationId,
  });

  return enqueueTemplateEmail({
    to,
    subject: `Your ${organizationName} Account Has Been Approved!`,
    template: await loadTemplate("auth", "UserAccountApproved"),
    templateProps: {
      userName,
      organizationName,
      primaryColor,
      logoUrl,
      loginUrl: `${url}/org/${organizationId}/login`,
      ideasUrl: `${url}/org/${organizationId}/ideas`,
    },
    categories: ["account-approved", organizationId],
    type: "account-approved",
    priority: EmailPriority.NORMAL,
    organizationId,
  });
}

// ============================================
// IDEA NOTIFICATION EMAILS
// ============================================

/**
 * Notify an idea author that someone commented on their idea.
 */
export async function sendCommentOnIdeaEmail(
  to,
  {
    userId,
    ideaId,
    userName,
    ideaTitle,
    ideaUrl,
    commenterName,
    commentPreview,
    organizationId,
    organization,
  }
) {
  if (userId && ideaId) {
    const shouldSend = await shouldSendIdeaNotification(
      userId,
      ideaId,
      NotificationType.COMMENTS_ON_IDEAS,
      { isIdeaAuthor: true }
    );
    if (!shouldSend) {
      logger.info("[NotificationEmail] [SKIPPED] Comment notification (user preference)", {
        to,
        ideaTitle,
      });
      return { success: true, skipped: true, reason: "user-preference" };
    }
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const url = baseUrl();

  logger.info("[NotificationEmail] Sending comment notification", { to, ideaTitle, commenterName });

  return enqueueTemplateEmail({
    to,
    subject: `${commenterName} commented on your idea: ${ideaTitle}`,
    template: await loadTemplate("notifications", "CommentOnIdea"),
    templateProps: {
      userName,
      ideaTitle,
      ideaUrl,
      commenterName,
      commentPreview: commentPreview?.substring(0, 150) || "",
      organizationName,
      primaryColor,
      logoUrl,
      unsubscribeUrl: ideaId
        ? `${url}/org/${organizationId}/ideas/${ideaId}?unsubscribe=true`
        : null,
    },
    categories: ["comment-notification", organizationId],
    type: "comment-on-idea",
    priority: EmailPriority.NORMAL,
    organizationId,
  });
}

/**
 * Notify an idea author that the status of their idea has changed.
 */
export async function sendStatusChangeEmail(
  to,
  {
    userId,
    _ideaId,
    userName,
    ideaTitle,
    ideaUrl,
    oldStatus,
    newStatus,
    adminName = null,
    adminComments = null,
    organizationId,
    organization,
  }
) {
  if (userId) {
    const shouldSend = await shouldSendNotification(userId, NotificationType.STATUS_CHANGES);
    if (!shouldSend) {
      logger.info("[NotificationEmail] [SKIPPED] Status change notification (user preference)", {
        to,
        ideaTitle,
      });
      return { success: true, skipped: true, reason: "user-preference" };
    }
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);

  logger.info("[NotificationEmail] Sending status change notification", {
    to,
    ideaTitle,
    oldStatus,
    newStatus,
  });

  return enqueueTemplateEmail({
    to,
    subject: `Your idea status changed: ${ideaTitle} is now ${newStatus}`,
    template: await loadTemplate("notifications", "StatusChange"),
    templateProps: {
      userName,
      ideaTitle,
      ideaUrl,
      oldStatus,
      newStatus,
      adminName,
      adminComments,
      organizationName,
      primaryColor,
      logoUrl,
    },
    categories: ["status-change", organizationId],
    type: "status-change",
    priority: EmailPriority.NORMAL,
    organizationId,
  });
}

/**
 * Send a celebration email when an idea is implemented.
 */
export async function sendIdeaImplementedEmail(
  to,
  {
    userId,
    userName,
    ideaTitle,
    ideaUrl,
    timeSavedMinutes = null,
    implementationDate = null,
    adminComments = null,
    organizationId,
    organization,
  }
) {
  if (userId) {
    const shouldSend = await shouldSendNotification(userId, NotificationType.IDEA_IMPLEMENTED);
    if (!shouldSend) {
      logger.info("[NotificationEmail] [SKIPPED] Idea implemented notification (user preference)", {
        to,
        ideaTitle,
      });
      return { success: true, skipped: true, reason: "user-preference" };
    }
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);

  logger.info("[NotificationEmail] Sending idea implemented notification", { to, ideaTitle });

  return enqueueTemplateEmail({
    to,
    subject: `Your idea was implemented: ${ideaTitle}`,
    template: await loadTemplate("notifications", "IdeaImplemented"),
    templateProps: {
      userName,
      ideaTitle,
      ideaUrl,
      timeSavedMinutes,
      implementationDate: implementationDate || new Date().toISOString(),
      adminComments,
      organizationName,
      organizationId,
      primaryColor,
      logoUrl,
    },
    categories: ["idea-implemented", organizationId],
    type: "idea-implemented",
    priority: EmailPriority.NORMAL,
    organizationId,
  });
}

/**
 * Notify the original commenter that someone replied to their comment.
 */
export async function sendCommentReplyEmail(
  to,
  {
    userId,
    ideaId,
    userName,
    ideaTitle,
    ideaUrl,
    replyAuthorName,
    replyPreview,
    originalCommentPreview = null,
    organizationId,
    organization,
  }
) {
  if (userId && ideaId) {
    const shouldSend = await shouldSendIdeaNotification(
      userId,
      ideaId,
      NotificationType.REPLIES_TO_COMMENTS,
      { isCommentAuthor: true }
    );
    if (!shouldSend) {
      logger.info("[NotificationEmail] [SKIPPED] Comment reply notification (user preference)", {
        to,
        ideaTitle,
      });
      return { success: true, skipped: true, reason: "user-preference" };
    }
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const url = baseUrl();

  logger.info("[NotificationEmail] Sending comment reply notification", {
    to,
    ideaTitle,
    replyAuthorName,
  });

  return enqueueTemplateEmail({
    to,
    subject: `${replyAuthorName} replied to your comment on: ${ideaTitle}`,
    template: await loadTemplate("notifications", "CommentReply"),
    templateProps: {
      userName,
      ideaTitle,
      ideaUrl,
      replyAuthorName,
      replyPreview: replyPreview?.substring(0, 150) || "",
      originalCommentPreview: originalCommentPreview?.substring(0, 100) || null,
      organizationName,
      primaryColor,
      logoUrl,
      unsubscribeUrl: ideaId
        ? `${url}/org/${organizationId}/ideas/${ideaId}?unsubscribe=true`
        : null,
    },
    categories: ["comment-reply", organizationId],
    type: "comment-reply",
    priority: EmailPriority.NORMAL,
    organizationId,
  });
}

// ============================================
// ADMIN NOTIFICATION EMAILS
// ============================================

/**
 * Notify an admin that a new idea has been submitted.
 */
export async function sendNewIdeaSubmittedEmail(
  to,
  {
    adminUserId,
    adminName = null,
    ideaTitle,
    ideaDescription,
    ideaUrl,
    authorName,
    category = null,
    priority = null,
    timeSavedMinutes = null,
    impactScore = null,
    effortScore = null,
    organizationId,
    organization,
  }
) {
  if (adminUserId) {
    const shouldSend = await shouldSendNotification(adminUserId, NotificationType.ADMIN_NEW_IDEAS);
    if (!shouldSend) {
      logger.info("[NotificationEmail] [SKIPPED] New idea admin notification (admin preference)", {
        to,
        ideaTitle,
      });
      return { success: true, skipped: true, reason: "admin-preference" };
    }
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);

  logger.info("[NotificationEmail] Sending new idea notification to admin", {
    to,
    ideaTitle,
    authorName,
  });

  return enqueueTemplateEmail({
    to,
    subject: `New idea submitted: ${ideaTitle}`,
    template: await loadTemplate("admin", "NewIdeaSubmitted"),
    templateProps: {
      adminName,
      ideaTitle,
      ideaDescription: ideaDescription?.substring(0, 200) || "",
      ideaUrl,
      authorName,
      category,
      priority,
      timeSavedMinutes,
      impactScore,
      effortScore,
      submittedAt: new Date().toISOString(),
      organizationName,
      primaryColor,
      logoUrl,
    },
    categories: ["new-idea-admin", organizationId],
    type: "new-idea-admin",
    priority: EmailPriority.NORMAL,
    organizationId,
  });
}

/**
 * Send a digest of stale ideas to an admin.
 */
export async function sendIdeasNeedAttentionEmail(
  to,
  {
    adminUserId,
    adminName = null,
    staleIdeas,
    threshold = 14,
    allIdeasUrl,
    organizationId,
    organization,
  }
) {
  if (adminUserId) {
    const shouldSend = await shouldSendNotification(
      adminUserId,
      NotificationType.ADMIN_NEEDS_ATTENTION
    );
    if (!shouldSend) {
      logger.info("[NotificationEmail] [SKIPPED] Stale ideas digest (admin preference)", { to });
      return { success: true, skipped: true, reason: "admin-preference" };
    }
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const count = staleIdeas?.length || 0;

  logger.info("[NotificationEmail] Sending stale ideas digest to admin", {
    to,
    count,
    threshold,
  });

  const subject = `${count} idea${count !== 1 ? "s" : ""} need${count === 1 ? "s" : ""} your attention - ${organizationName}`;

  return enqueueTemplateEmail({
    to,
    subject,
    template: await loadTemplate("admin", "IdeasNeedAttention"),
    templateProps: {
      adminName,
      staleIdeas,
      threshold,
      allIdeasUrl,
      organizationName,
      primaryColor,
      logoUrl,
    },
    categories: ["stale-ideas-digest", organizationId],
    type: "stale-ideas-digest",
    priority: EmailPriority.LOW,
    organizationId,
  });
}

/**
 * Send a daily / hourly / weekly idea digest to an admin.
 */
export async function sendDailyIdeaDigestEmail(
  to,
  {
    adminUserId,
    adminName = null,
    ideas,
    digestPeriod = "today",
    allIdeasUrl,
    organizationId,
    organization,
  }
) {
  // Digest emails reuse the ADMIN_NEW_IDEAS preference toggle.
  if (adminUserId) {
    const shouldSend = await shouldSendNotification(adminUserId, NotificationType.ADMIN_NEW_IDEAS);
    if (!shouldSend) {
      logger.info("[NotificationEmail] [SKIPPED] Idea digest (admin preference)", {
        to,
        digestPeriod,
      });
      return { success: true, skipped: true, reason: "admin-preference" };
    }
  }

  const { organizationName, primaryColor, logoUrl } = brandingFor(organization);
  const count = ideas?.length || 0;

  logger.info("[NotificationEmail] Sending idea digest to admin", { to, count, digestPeriod });

  const subject = `${count} new idea${count !== 1 ? "s" : ""} ${digestPeriod} - ${organizationName}`;

  return enqueueTemplateEmail({
    to,
    subject,
    template: await loadTemplate("admin", "DailyIdeaDigest"),
    templateProps: {
      adminName,
      ideas,
      digestPeriod,
      allIdeasUrl,
      organizationName,
      primaryColor,
      logoUrl,
    },
    categories: ["idea-digest", organizationId],
    type: "idea-digest",
    priority: EmailPriority.LOW,
    organizationId,
  });
}
