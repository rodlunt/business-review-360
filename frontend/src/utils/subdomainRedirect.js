// Issue #836: pure helper for the App.jsx subdomain-hop overlay logic.
//
// Extracted to utils/ per the established BR360 pattern (App.jsx OOMs the
// Vitest worker; decision logic must be pure helpers that take plain args).
// Mirrors the hostname check inside the App.jsx useEffect that actually
// performs the hop (`window.location.href = getSubdomainURL(...)`).

/**
 * Returns true when a path-based navigation to `/org/<slug>/...` from the
 * current location would trigger the App.jsx subdomain-hop useEffect.
 *
 * True only on the canonical main domain in production (apex or www).
 * False on tenant subdomains (no hop fires there - same-origin SPA route
 * change), and false on localhost / IPs / preview domains (left as
 * path-based by design).
 *
 * @param {string} [hostname] - override for tests (defaults to window.location.hostname)
 * @param {string} [baseDomain] - override for tests (defaults to VITE_BASE_DOMAIN env)
 * @returns {boolean}
 */
export function willHopToSubdomain(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
  baseDomain = (typeof import.meta !== "undefined" && import.meta.env?.VITE_BASE_DOMAIN) ||
    "br360.example.com"
) {
  if (!hostname) return false;
  return hostname === baseDomain || hostname === `www.${baseDomain}`;
}
