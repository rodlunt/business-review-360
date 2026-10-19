// Tests for the rate-limiter key generator.
//
// Regression coverage for #482: the keyGenerator previously included
// req.query.clientId and X-Client-Id, both attacker-controlled. An attacker
// could set ?clientId=<victim> to target a user, or ?clientId=<random>
// per-request to bypass rate limiting entirely. The fix replaces all
// attacker-controlled surfaces with a server-determined key derived from
// req.user.id (fallback req.ip).

import { describe, test, expect } from "@jest/globals";
import {
  buildRateLimitKey,
  buildEmailLoginKey,
} from "../../backend/src/middleware/security.js";

describe("buildRateLimitKey (rate-limit bucket identifier)", () => {
  test("authenticated user wins over spoofed clientId query param", () => {
    const req = {
      query: { clientId: "attacker-spoofed" },
      user: { id: 42 },
      ip: "203.0.113.1",
      get: () => "attacker-spoofed-header",
    };

    const key = buildRateLimitKey(req);

    expect(key).toBe("42");
    expect(key).not.toBe("attacker-spoofed");
    expect(key).not.toContain("attacker-spoofed");
  });

  test("falls back to req.ip when no authenticated user", () => {
    const req = {
      query: { clientId: "attacker-spoofed" },
      ip: "203.0.113.1",
      get: () => "attacker-spoofed-header",
    };

    const key = buildRateLimitKey(req);

    expect(key).toBe("203.0.113.1");
    expect(key).not.toContain("attacker-spoofed");
  });

  test("ignores X-Client-Id header (previously attacker-controlled)", () => {
    const req = {
      ip: "203.0.113.7",
      get: (name) => {
        if (name === "X-Client-Id" || name === "x-client-id") {
          return "attacker-header";
        }
        return undefined;
      },
    };

    const key = buildRateLimitKey(req);

    expect(key).toBe("203.0.113.7");
    expect(key).not.toContain("attacker-header");
  });

  test("ignores Authorization header even with no user populated", () => {
    const req = {
      ip: "203.0.113.9",
      get: (name) => (name === "Authorization" ? "Bearer spoofed" : undefined),
    };

    const key = buildRateLimitKey(req);

    expect(key).toBe("203.0.113.9");
    expect(key).not.toContain("spoofed");
    expect(key).not.toContain("Bearer");
  });

  test("clientId string never appears in the returned key", () => {
    // Fuzz a bunch of attacker shapes against the generator. None should leak.
    const cases = [
      { query: { clientId: "victim-id" }, ip: "10.0.0.1" },
      { query: { clientId: "victim-id" }, user: {}, ip: "10.0.0.2" },
      {
        query: { clientId: "victim-id" },
        user: { id: 7 },
        ip: "10.0.0.3",
      },
      { body: { clientId: "victim-id" }, ip: "10.0.0.4" },
    ];

    for (const shape of cases) {
      const req = { ...shape, get: () => undefined };
      const key = buildRateLimitKey(req);
      expect(key).not.toContain("victim-id");
    }
  });

  test("empty-string user id falls through to req.ip (not treated as user)", () => {
    const req = {
      user: { id: "" },
      ip: "203.0.113.55",
      get: () => undefined,
    };

    expect(buildRateLimitKey(req)).toBe("203.0.113.55");
  });

  test("numeric user id is coerced to string for stable bucket keys", () => {
    const req = {
      user: { id: 12345 },
      ip: "203.0.113.1",
      get: () => undefined,
    };

    const key = buildRateLimitKey(req);
    expect(typeof key).toBe("string");
    expect(key).toBe("12345");
  });

  test("returns a usable fallback when neither user nor ip is populated", () => {
    const req = { get: () => undefined };
    const key = buildRateLimitKey(req);
    // Must not throw, must not be empty (express-rate-limit will reject empty).
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });
});

// Phase 5 (5a, #858): the org-less login limiter keys off the request
// body email on purpose (account-protection limiter, not attacker
// bucketing -- see the comment on buildEmailLoginKey). These guard the
// normalisation (so case/whitespace variants share one bucket) and the
// IP fallback.
describe("buildEmailLoginKey (org-less login bucket identifier)", () => {
  test("keys off the normalised body email (trim + lowercase, prefixed)", () => {
    const req = { body: { email: "  Alice@Example.COM  " }, ip: "203.0.113.1" };
    expect(buildEmailLoginKey(req)).toBe("email:alice@example.com");
  });

  test("case/whitespace variants of one email collapse to the same bucket", () => {
    const a = buildEmailLoginKey({ body: { email: "user@x.com" }, ip: "1.1.1.1" });
    const b = buildEmailLoginKey({ body: { email: "USER@X.COM " }, ip: "2.2.2.2" });
    expect(a).toBe(b);
  });

  test("falls back to req.ip when email is absent (org-scoped path)", () => {
    const req = { body: { organizationId: "demo-corp" }, ip: "203.0.113.9" };
    expect(buildEmailLoginKey(req)).toBe("203.0.113.9");
  });

  test("falls back to req.ip when email is blank or non-string", () => {
    expect(buildEmailLoginKey({ body: { email: "   " }, ip: "10.0.0.1" })).toBe("10.0.0.1");
    expect(buildEmailLoginKey({ body: { email: 42 }, ip: "10.0.0.2" })).toBe("10.0.0.2");
  });

  test("does not throw and returns a usable key when body and ip are absent", () => {
    const key = buildEmailLoginKey({});
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });
});
