// OAuth/SSO provider catalogue + per-provider configuration probes.
// Consumed by routes/auth.js (POST /discover-providers, Phase 5 #892).
// routes/oauth.js carries the URL surfaces (auth/token/profile) for the
// full code-exchange flow; this module deliberately only holds the
// catalogue + the "enabled + credentials present" predicate so the
// discover endpoint doesn't pull the route module into its import graph.
//
// Order matters: OAUTH_PROVIDERS defines the canonical output order so
// the response array is stable regardless of org iteration order.

export const OAUTH_PROVIDERS = ["google", "github", "microsoft", "azure-ad"];

// Map provider -> Organization column that toggles it. Mirrors the same
// const declared inside routes/oauth.js (kept private there).
export const PROVIDER_ENABLED_FIELD = {
  google: "oauthGoogleEnabled",
  github: "oauthGithubEnabled",
  microsoft: "oauthMicrosoftEnabled",
  "azure-ad": "ssoAzureEnabled",
};

// True if the env vars + (for azure-ad) org-level tenantId required to
// initiate the OAuth code flow are all present. Mirrors the runtime
// `config?.clientId` checks done inside routes/oauth.js so an "enabled"
// flag without credentials cannot surface a dead button to the user.
export function hasProviderCredentials(provider, org) {
  if (provider === "google") {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  if (provider === "github") {
    return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  }
  if (provider === "microsoft") {
    return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  }
  if (provider === "azure-ad") {
    return Boolean(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      org?.ssoAzureTenantId
    );
  }
  return false;
}

// Subset of OAUTH_PROVIDERS that the given org has both enabled AND
// configured. Returns a fresh array in OAUTH_PROVIDERS order.
export function getActiveProvidersForOrg(org) {
  if (!org) return [];
  return OAUTH_PROVIDERS.filter((p) => {
    const enabledField = PROVIDER_ENABLED_FIELD[p];
    if (!org[enabledField]) return false;
    return hasProviderCredentials(p, org);
  });
}
