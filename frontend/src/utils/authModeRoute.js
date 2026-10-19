/**
 * Issue #893 — compute the target URL when switching between the login and
 * register modes in the auth form.
 *
 * Returns null when the current path is not a recognised auth URL so the
 * caller can skip the navigate (e.g. the form somehow mounted on a non-auth
 * route). Returns the current path unchanged when the mode already matches
 * (caller skips the navigate to avoid a redundant history entry).
 *
 * The auth form is mounted on three URL shapes:
 *   1. Org-less main domain:        `/login` ↔ `/register`
 *   2. Tenant subdomain:            `/login` ↔ `/register` (same path shape; no org segment)
 *   3. Legacy explicit-org path:    `/org/:id/login` ↔ `/org/:id/register`
 *
 * Cases 1 and 2 collapse to the same bare-slug branch because the bare
 * routes are shared between the org-less main domain and tenant subdomains
 * (see AppRoutes.jsx and CLAUDE.md "Subdomain tenancy is live").
 *
 * Pure helper. Lives outside App.jsx because App.jsx OOMs the Vitest worker
 * when rendered in tests (CLAUDE.md convention: gating/sequencing logic in
 * App.jsx must live in pure helpers and be unit-tested directly).
 *
 * @param {string} currentPath          window.location.pathname
 * @param {"login"|"register"} newMode  the mode the user is switching TO
 * @param {string|null} organizationId  current org id from useOrganizationId(), or null
 * @returns {string|null}               target path, or null if no navigate
 */
export function authModeTargetUrl(currentPath, newMode, organizationId) {
  if (newMode !== "login" && newMode !== "register") return null;

  // Legacy explicit-org path: /org/:id/(login|register)
  if (organizationId) {
    const orgLogin = `/org/${organizationId}/login`;
    const orgRegister = `/org/${organizationId}/register`;
    if (currentPath === orgLogin || currentPath === orgRegister) {
      return `/org/${organizationId}/${newMode}`;
    }
  }

  // Bare slug (covers org-less main domain AND tenant subdomain).
  if (currentPath === "/login" || currentPath === "/register") {
    return `/${newMode}`;
  }

  // Anywhere else — caller should not navigate.
  return null;
}
