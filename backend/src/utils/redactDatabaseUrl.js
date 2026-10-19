/**
 * Redact the password from a postgres connection URL so the rest of the URL
 * (user, host, port, database, query parameters) can be safely logged.
 *
 * Issue #541: DATABASE_URL and PLATFORM_DATABASE_URL were being logged in the
 * clear on every backend boot, leaking the DB password into container logs.
 * This utility is the single guard both call sites now route through.
 *
 * Portability note: pure function, takes the URL as an argument, never reads
 * process.env. Safe to use from any caller (models, scripts, CLI tools).
 *
 * @param {string|null|undefined} url - A postgres/postgresql connection URL.
 * @returns {string} A diagnosable version of the URL with the password masked
 *   as ***, or a clearly-labelled placeholder for missing or unparseable input.
 */
export function redactDatabaseUrl(url) {
  if (!url) {
    return "(not set)";
  }

  try {
    const parsed = new URL(url);

    if (parsed.password) {
      parsed.password = "***";
    }

    return parsed.toString();
  } catch {
    // Never echo the raw value: it might itself be a password fragment.
    return "(unparseable database URL)";
  }
}
