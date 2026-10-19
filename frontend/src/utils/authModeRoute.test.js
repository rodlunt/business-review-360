/**
 * Issue #893 — unit tests for authModeTargetUrl.
 *
 * Pure-helper coverage of the URL-tracking-on-mode-switch logic in
 * `App.jsx#handleSwitchMode`. The full App render is too heavy for Vitest
 * (CLAUDE.md OOM convention), so the decision logic is extracted here and
 * tested with plain args.
 */

import { describe, it, expect } from "vitest";
import { authModeTargetUrl } from "./authModeRoute";

describe("authModeTargetUrl", () => {
  describe("bare slugs (org-less main domain + tenant subdomain)", () => {
    it("/login + register -> /register", () => {
      expect(authModeTargetUrl("/login", "register", null)).toBe("/register");
    });

    it("/register + login -> /login", () => {
      expect(authModeTargetUrl("/register", "login", null)).toBe("/login");
    });

    it("/login + login -> /login (no change; caller skips navigate)", () => {
      expect(authModeTargetUrl("/login", "login", null)).toBe("/login");
    });

    it("/login + register works the same on a tenant subdomain (no org segment in path)", () => {
      // On a tenant subdomain the pathname is bare /login even though the
      // hook reports an organizationId. The helper still picks the bare
      // branch because the legacy /org/:id/login path isn't present.
      expect(authModeTargetUrl("/login", "register", "demo-corp")).toBe("/register");
    });
  });

  describe("legacy explicit-org path /org/:id/(login|register)", () => {
    it("/org/foo/login + register -> /org/foo/register", () => {
      expect(authModeTargetUrl("/org/foo/login", "register", "foo")).toBe("/org/foo/register");
    });

    it("/org/foo/register + login -> /org/foo/login", () => {
      expect(authModeTargetUrl("/org/foo/register", "login", "foo")).toBe("/org/foo/login");
    });

    it("does not mismatch a path with a different org segment", () => {
      // Hook says we're in org "bar" but the URL says /org/foo/login. Don't
      // hijack the path; fall through to null (don't navigate).
      expect(authModeTargetUrl("/org/foo/login", "register", "bar")).toBeNull();
    });
  });

  describe("unrecognised paths and inputs", () => {
    it("returns null on a non-auth path (don't navigate)", () => {
      expect(authModeTargetUrl("/dashboard", "register", "foo")).toBeNull();
      expect(authModeTargetUrl("/", "register", null)).toBeNull();
      expect(authModeTargetUrl("/try", "register", null)).toBeNull();
    });

    it("returns null on an invalid mode string", () => {
      expect(authModeTargetUrl("/login", "bogus", null)).toBeNull();
      expect(authModeTargetUrl("/login", "", null)).toBeNull();
      expect(authModeTargetUrl("/login", undefined, null)).toBeNull();
    });

    it("returns null on /reset-password (not a login/register path)", () => {
      expect(authModeTargetUrl("/reset-password", "login", null)).toBeNull();
    });
  });
});
