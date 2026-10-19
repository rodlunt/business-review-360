/**
 * StorageAdapter
 *
 * Abstract base class describing the contract every storage backend must
 * implement. Concrete implementations (local disk today, Azure Blob later)
 * extend this class and override each method.
 *
 * The interface is intentionally small: just enough for current upload
 * middleware needs (logo/avatar image uploads via multer) plus the
 * operations any realistic blob store already supports. Keeping the
 * surface area narrow means swapping providers is a config flip, not a
 * rewrite.
 *
 * All methods are async. Implementations must return Promises even for
 * operations that could be synchronous on local disk, so consumers never
 * need to branch on provider type.
 */

/**
 * @typedef {Object} SaveResult
 * @property {string} url   Public-facing URL or path the client uses to
 *                          fetch the file (e.g. "/uploads/123-foo.png"
 *                          for local, a signed Blob URL for Azure).
 * @property {string} path  Provider-specific internal path or key. For
 *                          local disk this is the absolute filesystem
 *                          path; for Blob, the container-relative key.
 */

export class StorageAdapter {
  /**
   * Persist a file to the backing store.
   *
   * @param {string} filename     Final filename (already timestamped /
   *                              sanitised by the caller).
   * @param {Buffer} buffer       File contents.
   * @param {Object} [options]    Reserved for provider-specific hints
   *                              (contentType, cacheControl, etc.).
   * @returns {Promise<SaveResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async save(filename, buffer, options) {
    throw new Error("StorageAdapter.save() must be implemented by subclass");
  }

  /**
   * Remove a file from the backing store. Should be idempotent: deleting
   * a missing file must not throw.
   *
   * @param {string} filename
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async delete(filename) {
    throw new Error("StorageAdapter.delete() must be implemented by subclass");
  }

  /**
   * Return the public URL (or path) for a stored file without any IO.
   *
   * @param {string} filename
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line no-unused-vars
  async getUrl(filename) {
    throw new Error("StorageAdapter.getUrl() must be implemented by subclass");
  }

  /**
   * Return a readable stream for a stored file. Caller is responsible
   * for consuming or destroying the stream.
   *
   * @param {string} filename
   * @returns {Promise<import("stream").Readable>}
   */
  // eslint-disable-next-line no-unused-vars
  async getStream(filename) {
    throw new Error("StorageAdapter.getStream() must be implemented by subclass");
  }

  /**
   * Check whether a file exists in the backing store.
   *
   * @param {string} filename
   * @returns {Promise<boolean>}
   */
  // eslint-disable-next-line no-unused-vars
  async exists(filename) {
    throw new Error("StorageAdapter.exists() must be implemented by subclass");
  }
}

export default StorageAdapter;
