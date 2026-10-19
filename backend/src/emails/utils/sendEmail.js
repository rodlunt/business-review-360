import { renderEmail } from "./renderEmail.js";
import { sendViaResend, isResendConfigured } from "./resendClient.js";
import { logger } from "../../utils/logger.js";

/**
 * Compose a From header value, applying EMAIL_FROM_NAME as the display name
 * when set and when the address does not already include one.
 *
 * Examples:
 *   buildFromHeader('auth@x.au')                                  -> 'auth@x.au'
 *   buildFromHeader('auth@x.au', 'BR360')                         -> 'BR360 <auth@x.au>'
 *   buildFromHeader('Already Set <auth@x.au>', 'Ignored')         -> 'Already Set <auth@x.au>'
 *
 * Display name is bare-quoted only when it contains characters that require
 * quoting under RFC 5322 (`"`, `\`, or any of `,;:<>@()[]`). This keeps the
 * common case ("Business Review 360 <auth@...>") clean while still being safe.
 */
export function buildFromHeader(address, displayName) {
  if (!address) return address;
  if (address.includes("<") && address.includes(">")) {
    return address;
  }
  if (!displayName) return address;
  const trimmedName = String(displayName).trim();
  if (!trimmedName) return address;
  const needsQuoting = /[",;:<>@()[\]\\]/.test(trimmedName);
  const safeName = needsQuoting ? `"${trimmedName.replace(/(["\\])/g, "\\$1")}"` : trimmedName;
  return `${safeName} <${address}>`;
}

/**
 * Check if email sending is in test/development mode.
 *
 * Resend is now the sole supported provider (the nodemailer/Gmail fallback
 * was removed in #708). When `RESEND_API_KEY` is unset we treat every send
 * as test-mode so dev environments without credentials log instead of throw.
 */
export function isTestMode(toEmail) {
  const isTestEmail =
    toEmail.includes("example.com") ||
    toEmail.includes("test.com") ||
    toEmail.includes("testuser") ||
    toEmail.includes("localhost") ||
    process.env.NODE_ENV === "test";

  const hasEmailConfig = Boolean(process.env.RESEND_API_KEY);

  return !hasEmailConfig || isTestEmail;
}

/**
 * Send an email using a React Email template.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {Function} options.template - React Email component
 * @param {Object} options.templateProps - Props to pass to the template
 * @param {string} options.from - Sender email (optional, uses default)
 * @param {string} options.replyTo - Reply-to address (optional)
 * @param {Array<string>} options.categories - Tracking labels. Translated to
 *   Resend `tags: [{name:'category', value}]` by `sendViaResend`.
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendTemplateEmail({
  to,
  subject,
  template,
  templateProps = {},
  from = null,
  replyTo = null,
  categories = [],
}) {
  const fromAddress = from || process.env.EMAIL_FROM || "hello@br360.example.com";
  const fromEmail = buildFromHeader(fromAddress, process.env.EMAIL_FROM_NAME);

  // Check for test/dev mode
  if (isTestMode(to)) {
    logger.info("[SendEmail] [DEV/TEST MODE] Email would be sent", {
      to,
      from: fromEmail,
      subject,
      template: template.name || "Unknown",
      props: templateProps,
    });
    return { success: true, messageId: "test-mode-no-send" };
  }

  try {
    // Render the template
    const { html, text } = await renderEmail(template, templateProps);

    const emailContent = {
      to,
      from: fromEmail,
      subject,
      html,
      text,
      ...(replyTo && { replyTo }),
      ...(categories.length > 0 && { categories }),
    };

    // Send via Resend if configured
    if (isResendConfigured()) {
      const result = await sendViaResend(emailContent);
      logger.info(`[SendEmail] Email sent via Resend to: ${to}`);
      return {
        success: true,
        messageId: result.id,
      };
    }

    // No email provider configured (the nodemailer/Gmail fallback was
    // removed in #708; Resend is the sole supported provider).
    logger.warn("[SendEmail] No email provider configured. Email not sent.");
    return {
      success: false,
      error: "No email provider configured",
    };
  } catch (error) {
    logger.error("[SendEmail] Error sending email:", error.response?.body || error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send a raw HTML email (for backwards compatibility).
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @param {string} options.from - Sender email (optional)
 * @param {Array<string>} options.categories - Tracking labels forwarded to
 *   Resend as `tags`. Required when the queue worker sends pre-rendered HTML
 *   so per-org tags survive the enqueue → drain round-trip.
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendRawEmail({
  to,
  subject,
  html,
  text = null,
  from = null,
  replyTo = null,
  categories = [],
}) {
  const fromAddress = from || process.env.EMAIL_FROM || "hello@br360.example.com";
  const fromEmail = buildFromHeader(fromAddress, process.env.EMAIL_FROM_NAME);

  // Check for test/dev mode
  if (isTestMode(to)) {
    logger.info("[SendEmail] [DEV/TEST MODE] Raw email would be sent", {
      to,
      from: fromEmail,
      subject,
    });
    return { success: true, messageId: "test-mode-no-send" };
  }

  try {
    const emailContent = {
      to,
      from: fromEmail,
      subject,
      html,
      ...(text && { text }),
      ...(replyTo && { replyTo }),
      ...(categories.length > 0 && { categories }),
    };

    // Send via Resend if configured
    if (isResendConfigured()) {
      const result = await sendViaResend(emailContent);
      logger.info(`[SendEmail] Raw email sent via Resend to: ${to}`);
      return {
        success: true,
        messageId: result.id,
      };
    }

    logger.warn("[SendEmail] No email provider configured. Email not sent.");
    return {
      success: false,
      error: "No email provider configured",
    };
  } catch (error) {
    logger.error("[SendEmail] Error sending raw email:", error.response?.body || error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default sendTemplateEmail;
