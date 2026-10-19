const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || "br360.example.com";

/**
 * Returns the tenant slug from the current hostname subdomain, or null when
 * not on a tenant subdomain (localhost, main domain, IP address).
 *
 * Pure function: reads window.location at call time. Safe to call in hooks,
 * event handlers, or effects. Returns null in Vitest/JSDOM (hostname is
 * 'localhost'), so URL-param fallback in useOrganizationId() kicks in for tests.
 */
export function getSubdomainOrgId() {
  const hostname = window.location.hostname;
  if (!hostname) return null;
  if (hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
  if (!hostname.endsWith("." + BASE_DOMAIN)) return null;
  const sub = hostname.slice(0, -(BASE_DOMAIN.length + 1));
  // Reject www (main domain) and multi-segment subdomains
  if (!sub || sub === "www" || sub.includes(".")) return null;
  return sub;
}

export function isOnSubdomain() {
  return !!getSubdomainOrgId();
}

export function isAdminSubdomain() {
  return getSubdomainOrgId() === "admin";
}

/**
 * Build an org-relative URL.
 *
 * On a tenant subdomain: returns /page (bare path).
 * On the main domain:    returns /org/<orgId>/page (legacy prefix path).
 *
 * @param {string} organizationId
 * @param {string} [page]  Path segment(s) after the org prefix, without leading slash.
 *                         Omit to get the org root.
 */
export function orgPath(organizationId, page) {
  if (isOnSubdomain()) {
    return page ? `/${page}` : "/";
  }
  return page ? `/org/${organizationId}/${page}` : `/org/${organizationId}`;
}

/**
 * Construct a full subdomain URL for a given organization and page.
 * Used for redirects and cross-origin navigation.
 *
 * @param {string} organizationId - Org slug (e.g., "demo-corp")
 * @param {string} [page] - Optional page path (e.g., "login", "home")
 * @returns {string} Full URL (e.g., "https://demo-corp.br360.example.com/login")
 */
export function getSubdomainURL(organizationId, page = "") {
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || "br360.example.com";
  const protocol = window.location.protocol || "https:";
  const path = page ? `/${page}` : "/";
  return `${protocol}//${organizationId}.${baseDomain}${path}`;
}
