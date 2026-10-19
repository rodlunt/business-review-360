/**
 * Issue #859 -- loginThrottle unit coverage.
 *
 * Hermetic: the SQL-heavy lock/window/escalation logic is Postgres-only
 * (ON CONFLICT / FOR UPDATE / make_interval) and is exercised against a
 * real Postgres in loginThrottle.integration.test.js. Here we cover the
 * pure key derivation and the disabled-mode contract (.env.test sets
 * DISABLE_RATE_LIMIT=true, so the service must no-op without ever
 * touching the database).
 */
import { describe, test, expect } from "@jest/globals";
import {
  loginThrottleKey,
  isLocked,
  registerFailure,
  clearThrottle,
} from "../../backend/src/services/loginThrottle.js";

describe("loginThrottleKey derivation", () => {
  test("org-less keys off the normalised email (trim + lowercase)", () => {
    expect(loginThrottleKey({ email: "  Alice@Example.COM " })).toBe(
      "email:alice@example.com"
    );
  });

  test("case/whitespace variants of one email collapse to one key", () => {
    expect(loginThrottleKey({ email: "user@x.com" })).toBe(
      loginThrottleKey({ email: "USER@X.COM " })
    );
  });

  test("org-scoped keys off org + the normalised email (#892: no more username credential)", () => {
    expect(
      loginThrottleKey({ organizationId: "demo-corp", email: "  DCAdmin@Example.COM " })
    ).toBe("org:demo-corp:email:dcadmin@example.com");
  });

  test("org-scoped and org-less keys for the same email do not collide", () => {
    const orgless = loginThrottleKey({ email: "a@b.com" });
    const scoped = loginThrottleKey({
      organizationId: "demo-corp",
      email: "a@b.com",
    });
    expect(orgless).not.toBe(scoped);
  });

  test("returns null when there is nothing to key on", () => {
    expect(loginThrottleKey({})).toBeNull();
    expect(loginThrottleKey({ email: "   " })).toBeNull();
    expect(loginThrottleKey({ email: 42 })).toBeNull();
    expect(loginThrottleKey({ organizationId: "demo-corp" })).toBeNull();
    expect(loginThrottleKey()).toBeNull();
  });
});

describe("disabled-mode contract (.env.test DISABLE_RATE_LIMIT=true)", () => {
  test("isLocked resolves false without a database", async () => {
    await expect(isLocked("email:nobody@example.com")).resolves.toBe(false);
  });

  test("registerFailure and clearThrottle no-op without throwing", async () => {
    await expect(registerFailure("email:nobody@example.com")).resolves.toBeUndefined();
    await expect(clearThrottle("email:nobody@example.com")).resolves.toBeUndefined();
  });

  test("a null key is always a no-op (false / undefined)", async () => {
    await expect(isLocked(null)).resolves.toBe(false);
    await expect(registerFailure(null)).resolves.toBeUndefined();
    await expect(clearThrottle(null)).resolves.toBeUndefined();
  });
});
