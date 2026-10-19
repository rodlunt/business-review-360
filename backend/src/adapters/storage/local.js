import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

import { StorageAdapter } from "./interface.js";

/**
 * LocalStorageAdapter
 *
 * Writes and reads files on the local filesystem. Matches the behaviour
 * of the existing multer diskStorage path in
 * backend/src/middleware/upload.js: files live under an "uploads"
 * directory relative to the process cwd, and URLs are served via the
 * Express static mount at "/uploads/<filename>".
 *
 * Construct with an explicit uploadsDir for tests or alternate layouts;
 * the default preserves current production behaviour.
 */
export class LocalStorageAdapter extends StorageAdapter {
  /**
   * @param {Object} [options]
   * @param {string} [options.uploadsDir]  Absolute path to the uploads
   *                                       directory. Defaults to
   *                                       "<cwd>/uploads".
   * @param {string} [options.urlPrefix]   URL prefix the static mount
   *                                       serves from. Defaults to
   *                                       "/uploads".
   */
  constructor(options = {}) {
    super();
    this.uploadsDir = options.uploadsDir || path.join(process.cwd(), "uploads");
    this.urlPrefix = options.urlPrefix || "/uploads";
  }

  /**
   * Ensure the uploads directory exists. Safe to call repeatedly.
   * @returns {Promise<void>}
   */
  async ensureDir() {
    await fs.mkdir(this.uploadsDir, { recursive: true });
  }

  /**
   * Resolve a caller-supplied filename to an absolute path inside the
   * uploads directory, rejecting any path-traversal attempts.
   *
   * @param {string} filename
   * @returns {string}
   */
  resolvePath(filename) {
    const base = path.basename(filename);
    if (base !== filename) {
      throw new Error("LocalStorageAdapter: filename must not contain path separators");
    }
    return path.join(this.uploadsDir, base);
  }

  async save(filename, buffer) {
    await this.ensureDir();
    const target = this.resolvePath(filename);
    await fs.writeFile(target, buffer);
    return {
      url: `${this.urlPrefix}/${path.basename(filename)}`,
      path: target,
    };
  }

  async delete(filename) {
    const target = this.resolvePath(filename);
    try {
      await fs.unlink(target);
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return;
      }
      throw err;
    }
  }

  async getUrl(filename) {
    return `${this.urlPrefix}/${path.basename(filename)}`;
  }

  async getStream(filename) {
    const target = this.resolvePath(filename);
    // Probe existence so callers get a clean rejection rather than a
    // stream that errors on first read.
    await fs.access(target);
    return createReadStream(target);
  }

  async exists(filename) {
    const target = this.resolvePath(filename);
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }
}

export default LocalStorageAdapter;
