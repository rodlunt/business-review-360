import { logger } from "../utils/logger.js";

/**
 * reCAPTCHA v3 server-side verification. Currently called from /register
 * (Issue #476) and /billing/demo-access (#566).
 *
 * Behaviour:
 *   - Issue #878: when env `RECAPTCHA_E2E_BYPASS_TOKEN` is set to a
 *     non-empty string AND the incoming `token` equals that value
 *     EXACTLY, returns a synthetic success payload so the e2e harness
 *     can drive paths that hard-require a real Google v3 token (#566's
 *     /billing/demo-access in particular - the suite-wide network block
 *     of `**\/recaptcha/**` prevents the browser from ever obtaining a
 *     real one). PRODUCTION SAFETY: the env var must not be set in any
 *     prod environment. `deploy-production.yml` does not propagate it
 *     and the server .env is reviewed. Loud `logger.warn` on every bypass
 *     so a misconfiguration is immediately visible in logs.
 *   - If RECAPTCHA_SECRET_KEY is unset, throws with statusCode=503 so callers
 *     can surface "reCAPTCHA misconfigured on server". We do not silently
 *     pass-through when the secret is missing.
 *   - On upstream HTTP error, throws a generic Error. Callers should 400 the
 *     client so they do not learn which way the verify failed.
 *   - On a successful upstream call, returns the raw Google response. Callers
 *     inspect `success` (and optionally `score` for v3 threshold checks).
 */
export async function verifyRecaptcha(token, remoteIp) {
  // Issue #878: e2e test-mode bypass. Single-knob design - the e2e workflow
  // runs the backend with NODE_ENV=production for prod-realism, so a
  // NODE_ENV-based check would defeat the purpose. The safety property is
  // "env var must not be set in prod"; the loud warn below makes any leak
  // immediately visible.
  const bypassToken = process.env.RECAPTCHA_E2E_BYPASS_TOKEN;
  if (bypassToken && token === bypassToken) {
    logger.warn(
      "[reCAPTCHA] E2E test-mode bypass fired. " +
        "RECAPTCHA_E2E_BYPASS_TOKEN is set in this environment - it MUST NOT " +
        "be set in production. Verify your deploy config. " +
        `NODE_ENV=${process.env.NODE_ENV || "unset"}.`
    );
    return { success: true, score: 1.0, action: "test_bypass" };
  }

  if (!process.env.RECAPTCHA_SECRET_KEY) {
    const err = new Error("RECAPTCHA_SECRET_KEY not configured");
    err.statusCode = 503;
    throw err;
  }

  const params = new URLSearchParams({
    secret: process.env.RECAPTCHA_SECRET_KEY,
    response: token,
  });
  if (remoteIp) params.set("remoteip", remoteIp);

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!response.ok) {
    throw new Error(`reCAPTCHA upstream returned ${response.status}`);
  }

  return response.json();
}
