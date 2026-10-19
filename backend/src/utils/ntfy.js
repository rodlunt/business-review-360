/**
 * ntfy.sh notification utility for production error alerting.
 *
 * Reads NTFY_URL from the environment (e.g.
 * https://ntfy.example.com/br360-bugs). Silently no-ops when the
 * variable is unset so local dev and test environments are unaffected.
 *
 * Rate limiting: at most one alert per unique (title, body-prefix) fingerprint
 * every COOLDOWN_MS. Pass urgent: true to bypass the cooldown for
 * process-level fatal errors where every occurrence matters.
 */

import { logger } from "./logger.js";

const COOLDOWN_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

// In-memory cooldown map. Keyed by fingerprint, value is last-sent timestamp.
const cooldowns = new Map();

function fingerprint(title, body) {
  return `${title}::${String(body).slice(0, 120)}`;
}

function isThrottled(fp) {
  const last = cooldowns.get(fp);
  return last != null && Date.now() - last < COOLDOWN_MS;
}

async function post(title, body, { priority = 3, tags = "warning" } = {}) {
  const ntfyUrl = process.env.NTFY_URL;
  if (!ntfyUrl) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    await fetch(ntfyUrl, {
      method: "POST",
      headers: {
        Title: String(title).slice(0, 250),
        Priority: String(priority),
        Tags: tags,
        "Content-Type": "text/plain",
      },
      body: String(body).slice(0, 4000),
      signal: controller.signal,
    });
  } catch (err) {
    logger.warn("[ntfy] Failed to send notification", { message: err.message });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a business-event notification (new signup, etc.). Not rate-limited --
 * each event is assumed to be unique and worth seeing every time.
 */
export async function notifyEvent(title, body, { priority = 3, tags = "tada" } = {}) {
  await post(title, body, { priority, tags });
}

/**
 * Send an error notification to ntfy.
 *
 * @param {string} title   - Short title shown in the push notification.
 * @param {string} body    - Detail text (stack trace snippet, request info, etc.)
 * @param {object} opts
 * @param {number}  [opts.priority=3]  - ntfy priority 1-5 (3=default, 5=max/urgent)
 * @param {boolean} [opts.urgent=false] - Skip rate limiting for fatal errors.
 * @returns {Promise<void>}
 */
export async function notifyError(title, body, { priority = 3, urgent = false } = {}) {
  if (!process.env.NTFY_URL) return;

  const fp = fingerprint(title, body);
  if (!urgent && isThrottled(fp)) return;
  cooldowns.set(fp, Date.now());

  await post(title, body, { priority, tags: urgent ? "rotating_light" : "warning" });
}
