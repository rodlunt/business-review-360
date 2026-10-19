/**
 * Bulk-import preview token (Issue #881).
 *
 * Two-step bulk-staff-import flow:
 *
 *   POST /api/users/bulk-upload/preview    -> validates the CSV, returns a
 *                                              signed previewToken and a dry-run
 *                                              summary (no users created, no
 *                                              email enqueued).
 *
 *   POST /api/users/bulk-upload/confirm    -> requires the previewToken from
 *                                              the prior step plus the SAME CSV
 *                                              file; only then are users
 *                                              created and invites enqueued.
 *
 * Token model is the existing BR360 stateless-JWT pattern (HS256 over
 * JWT_SECRET), matching `pickToken` in routes/auth.js. The token claims bind
 * the preview to a single uploader + organization + file (via SHA-256 file
 * hash); the route handler enforces all of these on confirm. TTL is short
 * (15 minutes) so an abandoned preview cannot be redeemed an hour later.
 *
 * Replay protection: stateless tokens cannot be marked "spent". A second
 * `/confirm` with the same {token, file} within the TTL would re-run the
 * row creation; the existing dedup checks inside `bulkImportFromCsv`
 * (`username already exists`, `email already exists`) make the second pass
 * a no-op (all rows skipped). That is the documented behaviour, covered by
 * test `confirm twice with the same file is a no-op on the second pass`.
 *
 * If stronger single-use semantics are ever required, the migration is to
 * a DB-backed `BulkImportPreview` row that confirm DELETEs. Not built today;
 * the dedup-as-replay-defence is sufficient for the current threat model.
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ValidationError } from "../services/errors.js";

const TOKEN_TYPE = "bulk-import-preview";
const TOKEN_TTL = "15m";

/**
 * SHA-256 hex digest of a CSV file buffer. Used to bind a previewToken to
 * the exact bytes that produced the preview; confirm rejects if the file
 * hash on the second request does not match.
 *
 * @param {Buffer|string} buffer
 * @returns {string} 64-char hex digest
 */
export function hashFileBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Sign a preview token. Caller must have validated the CSV already.
 *
 * @param {object} claims
 * @param {string} claims.userId         Uploader's user id.
 * @param {string} claims.organizationId Uploader's active organization id.
 * @param {string} claims.fileHash       SHA-256 hex of the CSV file buffer.
 * @param {number} claims.acceptedCount  Rows that passed validation in the preview.
 * @returns {string} JWT (HS256)
 */
export function signPreviewToken({ userId, organizationId, fileHash, acceptedCount }) {
  if (!process.env.JWT_SECRET) {
    // Same posture as auth.js's pickToken sign call; JWT_SECRET is required.
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign(
    {
      type: TOKEN_TYPE,
      userId,
      organizationId,
      fileHash,
      acceptedCount,
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL, algorithm: "HS256" }
  );
}

/**
 * Verify a preview token against the expected uploader, org, and file hash.
 * Throws ValidationError (400) on any mismatch or expiry. The caller does
 * not need to catch jsonwebtoken errors; they are translated here.
 *
 * @param {string} token
 * @param {object} expected
 * @param {string} expected.userId
 * @param {string} expected.organizationId
 * @param {string} expected.fileHash
 * @returns {object} payload (verified)
 */
export function verifyPreviewToken(token, { userId, organizationId, fileHash }) {
  if (!token || typeof token !== "string") {
    throw new ValidationError("Preview token is required", {
      code: "PREVIEW_TOKEN_MISSING",
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new ValidationError("Preview token has expired; re-run the preview step", {
        code: "PREVIEW_TOKEN_EXPIRED",
      });
    }
    // JsonWebTokenError (bad signature, malformed, wrong algorithm) and any
    // other verify failure collapse to a single opaque rejection. We do not
    // leak which specific JWT check failed.
    throw new ValidationError("Preview token is invalid", {
      code: "PREVIEW_TOKEN_INVALID",
    });
  }

  if (payload.type !== TOKEN_TYPE) {
    throw new ValidationError("Preview token is invalid", {
      code: "PREVIEW_TOKEN_INVALID",
    });
  }
  if (payload.userId !== userId) {
    throw new ValidationError("Preview token does not match this user", {
      code: "PREVIEW_TOKEN_USER_MISMATCH",
    });
  }
  if (payload.organizationId !== organizationId) {
    throw new ValidationError("Preview token does not match this organisation", {
      code: "PREVIEW_TOKEN_ORG_MISMATCH",
    });
  }
  if (payload.fileHash !== fileHash) {
    throw new ValidationError(
      "CSV file does not match the preview; re-upload the same file or re-run the preview step",
      { code: "PREVIEW_TOKEN_FILE_MISMATCH" }
    );
  }

  return payload;
}
