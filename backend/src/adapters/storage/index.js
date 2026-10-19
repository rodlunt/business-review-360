import { StorageAdapter } from "./interface.js";
import { LocalStorageAdapter } from "./local.js";

/**
 * Factory that returns the StorageAdapter implementation selected by
 * the STORAGE_PROVIDER environment variable.
 *
 * Supported values:
 *   - "local" (default): writes to ./uploads on the container
 *                        filesystem, served via Express static.
 *   - "azure-blob":      reserved for the follow-on implementation
 *                        under issue #495 (Key Vault / portability).
 *                        Not yet implemented; requesting it throws.
 *
 * @param {Object} [overrides]  Optional overrides for the chosen
 *                              adapter's constructor (primarily for
 *                              tests).
 * @returns {StorageAdapter}
 */
export function createStorageAdapter(overrides = {}) {
  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();

  switch (provider) {
    case "local":
      return new LocalStorageAdapter(overrides);
    case "azure-blob":
      throw new Error(
        "STORAGE_PROVIDER=azure-blob is not yet implemented (tracked under issue #495)"
      );
    default:
      throw new Error(`Unknown STORAGE_PROVIDER "${provider}"; expected "local" or "azure-blob"`);
  }
}

export { StorageAdapter, LocalStorageAdapter };
export default createStorageAdapter;
