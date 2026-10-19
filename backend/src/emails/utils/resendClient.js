import { Resend } from "resend";

let resendInstance = null;

function getResend() {
  if (!resendInstance && process.env.RESEND_API_KEY) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

/**
 * Sanitise a single category value to fit Resend's tag value rules.
 *
 * Resend's API restricts tag name and value to ASCII letters (a-z, A-Z),
 * digits (0-9), underscore, and dash, with a 256-character cap. Any other
 * character (including dots, slashes, spaces, non-ASCII) gets replaced with
 * an underscore so the SDK call does not reject the whole email.
 *
 * Returns null when the input is empty or non-string so callers can drop it.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
function sanitiseTagValue(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Translate the legacy `categories: string[]` shape used throughout the
 * codebase into Resend's `tags: [{name, value}]` shape.
 *
 * Resend rejects a send when two tags share the same `name` (422
 * validation_error: "The 'category' tag is duplicated."). The previous
 * implementation emitted `name: 'category'` for every entry, which broke
 * every transactional email in prod once Resend tightened tag-uniqueness
 * enforcement (#735). The convention across all `notificationEmailService`
 * callers is `[<email-type>, organizationId]`, so the first valid entry
 * becomes the `category` tag and the second becomes the `tenant` tag.
 * Any extra entries fall back to `category3`, `category4`, ... so the
 * helper stays safe for arbitrary inputs.
 *
 * @param {Array<string>|undefined} categories
 * @returns {Array<{name: string, value: string}>}
 */
const TAG_NAMES = ["category", "tenant"];
export function categoriesToResendTags(categories) {
  if (!Array.isArray(categories)) return [];
  const tags = [];
  for (const entry of categories) {
    const value = sanitiseTagValue(entry);
    if (value) {
      const name = TAG_NAMES[tags.length] ?? `category${tags.length + 1}`;
      tags.push({ name, value });
    }
  }
  return tags;
}

/**
 * Send an email via Resend. Accepts a flat options object (to, from,
 * subject, html, text, replyTo, categories) and maps replyTo -> reply_to
 * and categories -> tags per the Resend SDK shape.
 *
 * @param {Object} content
 * @param {string|string[]} content.to
 * @param {string} content.from
 * @param {string} content.subject
 * @param {string} content.html
 * @param {string} [content.text]
 * @param {string} [content.replyTo]
 * @param {Array<string>} [content.categories] - Legacy provider-agnostic
 *   tracking labels. Translated to Resend `tags: [{name:'category', value}]`
 *   before the SDK call so analytics in the Resend dashboard can filter by
 *   category. See `categoriesToResendTags` for the sanitisation rules.
 * @returns {Promise<{id: string}>}
 */
export async function sendViaResend({ to, from, subject, html, text, replyTo, categories }) {
  const resend = getResend();
  if (!resend) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const tags = categoriesToResendTags(categories);

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text && { text }),
    ...(replyTo && { reply_to: replyTo }),
    ...(tags.length > 0 && { tags }),
  });

  if (error) {
    const err = new Error(error.message || "Resend API error");
    err.response = { body: error };
    throw err;
  }

  return data;
}

export function isResendConfigured() {
  return !!process.env.RESEND_API_KEY;
}
