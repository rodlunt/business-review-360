/**
 * Issue #476 register-only scope guard.
 *
 * The verifyRecaptcha helper is the primary unit under test because:
 *   1. The register handler only calls it when recaptchaToken is on the body.
 *   2. Running the handler end-to-end requires the platform DB + tenant
 *      resolver, which is hostile inside the Jest worker.
 *
 * Three paths per the issue's acceptance criteria: missing secret (503),
 * upstream failure (throws), upstream success (returns Google payload).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { verifyRecaptcha } from "../../backend/src/lib/recaptcha.js";

const KNOWN_TOKEN = "frontend-issued-token-value";

let originalFetch;
let originalSecret;
let originalBypass;

beforeEach(() => {
  originalFetch = global.fetch;
  originalSecret = process.env.RECAPTCHA_SECRET_KEY;
  originalBypass = process.env.RECAPTCHA_E2E_BYPASS_TOKEN;
  // Default state for every test: no bypass token set, no real fetch wired.
  delete process.env.RECAPTCHA_E2E_BYPASS_TOKEN;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
  else process.env.RECAPTCHA_SECRET_KEY = originalSecret;
  if (originalBypass === undefined) delete process.env.RECAPTCHA_E2E_BYPASS_TOKEN;
  else process.env.RECAPTCHA_E2E_BYPASS_TOKEN = originalBypass;
});

describe("Issue #476 - verifyRecaptcha helper", () => {
  it("throws with statusCode=503 when RECAPTCHA_SECRET_KEY is unset", async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    await expect(verifyRecaptcha(KNOWN_TOKEN, "127.0.0.1")).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("throws when Google returns a non-OK HTTP status", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });

    await expect(verifyRecaptcha(KNOWN_TOKEN, "127.0.0.1")).rejects.toThrow(/502/);
  });

  it("returns the Google payload verbatim on a successful verify", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    const googlePayload = { success: true, score: 0.9, action: "register" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => googlePayload,
    });

    const result = await verifyRecaptcha(KNOWN_TOKEN, "127.0.0.1");
    expect(result).toEqual(googlePayload);
  });

  it("forwards secret, response token, and remoteip in the POST body", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret-xyz";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await verifyRecaptcha(KNOWN_TOKEN, "203.0.113.5");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
    expect(options.method).toBe("POST");

    const body = options.body.toString();
    expect(body).toContain("secret=test-secret-xyz");
    expect(body).toContain(`response=${KNOWN_TOKEN}`);
    expect(body).toContain("remoteip=203.0.113.5");
  });

  it("returns { success: false } verbatim when Google reports invalid token", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    const googlePayload = {
      success: false,
      "error-codes": ["invalid-input-response"],
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => googlePayload,
    });

    const result = await verifyRecaptcha(KNOWN_TOKEN, "127.0.0.1");
    expect(result.success).toBe(false);
    expect(result["error-codes"]).toContain("invalid-input-response");
  });
});

// ── Issue #878: e2e test-mode bypass ───────────────────────────────────────

describe("Issue #878 - RECAPTCHA_E2E_BYPASS_TOKEN", () => {
  const BYPASS = "e2e-test-recaptcha-token-do-not-use-in-prod";

  it("returns synthetic success when env var set AND token matches exactly", async () => {
    process.env.RECAPTCHA_E2E_BYPASS_TOKEN = BYPASS;
    // No fetch wired - if the bypass leaks through, this would crash on
    // `fetch is not a function` and fail the assertion.
    global.fetch = jest.fn(() => {
      throw new Error("bypass leaked to upstream fetch");
    });

    const result = await verifyRecaptcha(BYPASS, "127.0.0.1");
    expect(result).toEqual({ success: true, score: 1.0, action: "test_bypass" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does NOT bypass when the env var is unset (default state)", async () => {
    // beforeEach already deleted RECAPTCHA_E2E_BYPASS_TOKEN. Even if the
    // caller sends the bypass-shaped string, the upstream fetch must run.
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    const googlePayload = { success: false, "error-codes": ["invalid-input-response"] };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => googlePayload,
    });

    const result = await verifyRecaptcha(BYPASS, "127.0.0.1");
    expect(result).toEqual(googlePayload);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT bypass when env var set to a DIFFERENT value than the incoming token", async () => {
    process.env.RECAPTCHA_E2E_BYPASS_TOKEN = "some-other-sentinel-value";
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false }),
    });

    const result = await verifyRecaptcha(BYPASS, "127.0.0.1");
    // Falls through to Google verify, which returns {success:false} here.
    expect(result).toEqual({ success: false });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT bypass when env var set to empty string (treated as unset)", async () => {
    process.env.RECAPTCHA_E2E_BYPASS_TOKEN = "";
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    // Even passing a literally-empty token must not accidentally match.
    const result = await verifyRecaptcha("", "127.0.0.1");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it("does NOT bypass when token is undefined even if env var is set", async () => {
    process.env.RECAPTCHA_E2E_BYPASS_TOKEN = BYPASS;
    process.env.RECAPTCHA_SECRET_KEY = "test-secret";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false }),
    });

    const result = await verifyRecaptcha(undefined, "127.0.0.1");
    // Undefined token does not equal the bypass sentinel - falls through.
    expect(result).toEqual({ success: false });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("bypass still works even when RECAPTCHA_SECRET_KEY is unset (no 503)", async () => {
    process.env.RECAPTCHA_E2E_BYPASS_TOKEN = BYPASS;
    delete process.env.RECAPTCHA_SECRET_KEY;
    global.fetch = jest.fn(() => {
      throw new Error("bypass leaked to upstream fetch");
    });

    // Bypass runs BEFORE the secret-key guard so the e2e harness does not
    // need to set RECAPTCHA_SECRET_KEY for the demo-access path.
    const result = await verifyRecaptcha(BYPASS, "127.0.0.1");
    expect(result).toEqual({ success: true, score: 1.0, action: "test_bypass" });
  });
});
