// Magic-byte validation for uploaded files.
//
// Multer populates `req.file.mimetype` from the client-supplied multipart
// Content-Type header, which is trivially spoofable. This middleware sniffs
// the file's actual bytes via the `file-type` package and compares the
// detected MIME against an allowlist. It runs AFTER multer has buffered
// the file and BEFORE any downstream handler reads or serves it.
//
// Rejects with HTTP 415 (Unsupported Media Type) when:
//   1. No file is present.
//   2. The file has no discernible magic bytes (empty or unrecognised).
//   3. The sniffed MIME is not in the allowed list.
//   4. The client-claimed mimetype disagrees with the sniffed mimetype.
//
// SVG is intentionally NOT in the default allowlist. SVG can embed
// <script> and there is no safe generic rendering path. If SVG uploads
// are ever needed, they should go through a separate sanitisation route,
// not the generic upload middleware.
//
// The file-type library does not detect SVG from magic bytes (SVG is XML
// with no reliable binary signature), so an SVG file will usually fall
// through as "no discernible magic bytes" and be rejected by rule 2.
// As a defence-in-depth measure we also reject on the claimed mimetype
// `image/svg+xml` and on a conservative check for leading `<svg` /
// `<?xml` bytes before magic-byte sniffing.

import fs from "fs";
import { fileTypeFromBuffer } from "file-type";
import { logger, createLogger } from "../utils/logger.js";

// Default allowlist: raster image formats safe for generic rendering.
// Deliberately excludes SVG. Callers can override via options.allowed.
export const DEFAULT_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Max bytes to read when sniffing magic bytes from a disk file.
// file-type needs only a few hundred bytes; 4100 is the upstream default.
const SNIFF_BYTE_COUNT = 4100;

const reject = (res, reason, details = {}) => {
  logger.warn("[validateFileMagicBytes] Rejected upload:", { reason, ...details });
  return res.status(415).json({
    error: "Unsupported Media Type",
    reason,
  });
};

// Awaited so the response is held until the file is actually gone from disk.
// The previous fire-and-forget callback variant raced with synchronous
// post-await assertions in tests and (in theory) with any caller that
// inspected the upload directory immediately after the rejection response.
const cleanup = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      logger.warn("[validateFileMagicBytes] Failed to delete rejected upload:", {
        filePath,
        message: err.message,
      });
    }
  }
};

// Conservative early check for SVG / XML payloads. file-type does not
// identify SVG from its opening bytes, so we look for the XML declaration
// or a literal `<svg` tag (case-insensitive) at the start of the buffer.
const looksLikeSvgOrXml = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  // Skip a UTF-8 BOM if present.
  let offset = 0;
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    offset = 3;
  }
  const head = buffer
    .slice(offset, Math.min(buffer.length, offset + 512))
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg");
};

// Read the first N bytes of a disk file into a Buffer. Used so we can run
// both the SVG pre-check and file-type sniffing from the same sample.
const readFileHead = async (filePath, byteCount) => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(byteCount);
    const { bytesRead } = await handle.read(buffer, 0, byteCount, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

// Build the middleware. Options:
//   - allowed: array of allowed MIME types (default DEFAULT_ALLOWED_MIME_TYPES)
//   - required: if true (default) the middleware rejects when req.file is
//     missing. Set false if the upload field is optional.
export const validateFileMagicBytes = (options = {}) => {
  const allowed = options.allowed || DEFAULT_ALLOWED_MIME_TYPES;
  const required = options.required !== false;

  return async (req, res, next) => {
    const file = req.file;

    if (!file) {
      if (required) {
        return reject(res, "No file uploaded");
      }
      return next();
    }

    // Never accept an explicit SVG claim, even before sniffing. SVG is
    // excluded from the generic upload path (see file-level note).
    const claimed = (file.mimetype || "").toLowerCase();
    if (claimed === "image/svg+xml" || claimed === "image/svg") {
      await cleanup(file.path);
      return reject(res, "SVG uploads are not permitted", {
        claimed: file.mimetype,
      });
    }

    try {
      // Get a buffer to sniff. Memory storage exposes file.buffer; disk
      // storage exposes file.path.
      let sample;
      if (file.buffer && Buffer.isBuffer(file.buffer)) {
        sample = file.buffer;
      } else if (file.path) {
        sample = await readFileHead(file.path, SNIFF_BYTE_COUNT);
      } else {
        return reject(res, "Upload has neither buffer nor path");
      }

      if (!sample || sample.length === 0) {
        await cleanup(file.path);
        return reject(res, "File is empty or unreadable");
      }

      // Reject SVG / XML payloads that slip through with a different
      // claimed mimetype (e.g. claimed image/jpeg but body is `<svg ...>`).
      if (looksLikeSvgOrXml(sample)) {
        await cleanup(file.path);
        return reject(res, "SVG or XML content is not permitted", {
          claimed: file.mimetype,
        });
      }

      // Sniff the true MIME type from magic bytes.
      const detected =
        file.buffer && Buffer.isBuffer(file.buffer)
          ? await fileTypeFromBuffer(file.buffer)
          : await fileTypeFromBuffer(sample);

      if (!detected || !detected.mime) {
        await cleanup(file.path);
        return reject(res, "Could not determine file type from contents", {
          claimed: file.mimetype,
        });
      }

      const sniffedMime = detected.mime.toLowerCase();

      if (!allowed.includes(sniffedMime)) {
        await cleanup(file.path);
        return reject(res, "File type is not permitted", {
          claimed: file.mimetype,
          sniffed: sniffedMime,
        });
      }

      if (claimed && claimed !== sniffedMime) {
        await cleanup(file.path);
        return reject(res, "Claimed Content-Type does not match file contents", {
          claimed: file.mimetype,
          sniffed: sniffedMime,
        });
      }

      // Attach the verified mime back onto the request so downstream
      // handlers can trust it without re-sniffing.
      req.file.detectedMimeType = sniffedMime;
      return next();
    } catch (err) {
      const log = createLogger(req);
      log.error("[validateFileMagicBytes] Error while validating upload:", err);
      await cleanup(file.path);
      return reject(res, "Upload validation failed");
    }
  };
};

export default validateFileMagicBytes;
