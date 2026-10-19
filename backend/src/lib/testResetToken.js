/**
 * Per-boot bearer token used to authorise the test-only
 * POST /api/setup/reset-database endpoint. The token is generated the first
 * time `getTestResetToken` is called and written to a gitignored file that
 * the Playwright harness reads before issuing the request.
 *
 * Gating: only callers that pass `testResetEndpointsAllowed()` should ever
 * reach the token. The file is never created in production because the
 * conditional mount in routes/setup.js skips registration entirely.
 *
 * Issue #544.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const TEST_RESET_TOKEN_PATH = resolve(__dirname, "../../.test-reset-token");

export function testResetEndpointsAllowed() {
  return (
    process.env.ALLOW_DESTRUCTIVE_TEST_ENDPOINTS === "true" && process.env.NODE_ENV !== "production"
  );
}

let cachedToken = null;

export function getTestResetToken() {
  if (cachedToken) return cachedToken;

  if (existsSync(TEST_RESET_TOKEN_PATH)) {
    cachedToken = readFileSync(TEST_RESET_TOKEN_PATH, "utf8").trim();
    if (cachedToken.length >= 32) return cachedToken;
  }

  cachedToken = randomBytes(32).toString("hex");
  writeFileSync(TEST_RESET_TOKEN_PATH, cachedToken, { mode: 0o600 });
  return cachedToken;
}
