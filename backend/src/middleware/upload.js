import multer from "multer";
import path from "path";
import { logger, createLogger } from "../utils/logger.js";
import { createStorageAdapter } from "../adapters/storage/index.js";

export const storageAdapter = createStorageAdapter();

const fileFilter = (req, file, cb) => {
  logger.info("[Upload Middleware] File filter check:", {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  // Cheap first-pass reject based on the client-supplied Content-Type.
  // The real enforcement is magic-byte sniffing in
  // validateFileMagicBytes.js, which must be mounted AFTER multer in the
  // route chain. Never rely on `file.mimetype` alone for security:
  // multer copies it from the multipart header, which the client controls
  // and can set to anything (e.g. claiming `image/jpeg` for an SVG
  // carrying `<script>` or a PHP webshell).
  if (!file.mimetype.startsWith("image/")) {
    logger.error(
      "[Upload Middleware] File rejected at filter stage - not an image:",
      file.mimetype
    );
    return cb(new Error("Only image files are allowed!"), false);
  }

  // SVG is never accepted by the generic upload path (see
  // validateFileMagicBytes.js for the full reason).
  if (file.mimetype === "image/svg+xml" || file.mimetype === "image/svg") {
    logger.error("[Upload Middleware] File rejected at filter stage - SVG not permitted");
    return cb(new Error("SVG files are not permitted."), false);
  }

  logger.info(
    "[Upload Middleware] File provisionally accepted at filter stage (pending magic-byte check):",
    file.mimetype
  );
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Add error handling wrapper
const uploadWithLogging = {
  single: (fieldname) => {
    return (req, res, next) => {
      const log = createLogger(req);
      log.info("[Upload Middleware] Starting upload process for field:", fieldname);
      const uploadSingle = upload.single(fieldname);
      uploadSingle(req, res, (err) => {
        if (err) {
          log.error("[Upload Middleware] Upload error:", {
            error: err.message,
            code: err.code,
            field: err.field,
            storageErrors: err.storageErrors,
          });
        } else {
          if (req.file) {
            const ext = path.extname(req.file.originalname);
            const base = path.basename(req.file.originalname, ext);
            req.file.filename = `${Date.now()}-${base}${ext}`;
            log.info("[Upload Middleware] Upload middleware completed successfully");
          }
        }
        next(err);
      });
    };
  },
};

export default uploadWithLogging;
