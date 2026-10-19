/**
 * Issue #881 - bulkImportPreviewToken unit tests.
 *
 * Verifies the sign/verify contract in isolation from the route + service
 * layers. The service-layer tests in
 * `testing/backend-tests/services/userService.test.js` cover end-to-end
 * preview-then-confirm with token round-trip; this file pins the lower-level
 * helper behaviour so changes to it cannot silently relax the security
 * contract.
 *
 * Coverage:
 *   - hashFileBuffer is deterministic and 64-char hex
 *   - signPreviewToken round-trips through verifyPreviewToken
 *   - verifyPreviewToken rejects: missing, malformed, wrong signature,
 *     wrong type claim, user mismatch, org mismatch, file-hash mismatch,
 *     expired
 *   - JWT_SECRET absence at sign time throws
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import jwt from "jsonwebtoken";

import {
  hashFileBuffer,
  signPreviewToken,
  verifyPreviewToken,
} from "../../../backend/src/utils/bulkImportPreviewToken.js";

const BASE_CLAIMS = {
  userId: "11111111-1111-1111-1111-111111111111",
  organizationId: "test-org",
  fileHash: "a".repeat(64),
  acceptedCount: 3,
};

describe("hashFileBuffer", () => {
  it("returns a 64-char lower-case hex digest", () => {
    const hash = hashFileBuffer(Buffer.from("hello"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for identical input", () => {
    const a = hashFileBuffer(Buffer.from("identical-bytes"));
    const b = hashFileBuffer(Buffer.from("identical-bytes"));
    expect(a).toBe(b);
  });

  it("differs across different inputs", () => {
    const a = hashFileBuffer(Buffer.from("input-a"));
    const b = hashFileBuffer(Buffer.from("input-b"));
    expect(a).not.toBe(b);
  });
});

describe("signPreviewToken / verifyPreviewToken (round-trip)", () => {
  it("produces a token that verifies with matching expectations", () => {
    const token = signPreviewToken(BASE_CLAIMS);
    const payload = verifyPreviewToken(token, {
      userId: BASE_CLAIMS.userId,
      organizationId: BASE_CLAIMS.organizationId,
      fileHash: BASE_CLAIMS.fileHash,
    });
    expect(payload.type).toBe("bulk-import-preview");
    expect(payload.acceptedCount).toBe(3);
  });

  it("preserves the acceptedCount claim through the round-trip", () => {
    const token = signPreviewToken({ ...BASE_CLAIMS, acceptedCount: 42 });
    const payload = verifyPreviewToken(token, {
      userId: BASE_CLAIMS.userId,
      organizationId: BASE_CLAIMS.organizationId,
      fileHash: BASE_CLAIMS.fileHash,
    });
    expect(payload.acceptedCount).toBe(42);
  });
});

describe("verifyPreviewToken rejection paths", () => {
  it("rejects missing token", () => {
    expect(() =>
      verifyPreviewToken(undefined, {
        userId: BASE_CLAIMS.userId,
        organizationId: BASE_CLAIMS.organizationId,
        fileHash: BASE_CLAIMS.fileHash,
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_MISSING" }));
  });

  it("rejects a malformed token string", () => {
    expect(() =>
      verifyPreviewToken("not.a.jwt", {
        userId: BASE_CLAIMS.userId,
        organizationId: BASE_CLAIMS.organizationId,
        fileHash: BASE_CLAIMS.fileHash,
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_INVALID" }));
  });

  it("rejects a token signed with the wrong secret", () => {
    const forged = jwt.sign({ type: "bulk-import-preview", ...BASE_CLAIMS }, "different-secret", {
      algorithm: "HS256",
      expiresIn: "15m",
    });
    expect(() =>
      verifyPreviewToken(forged, {
        userId: BASE_CLAIMS.userId,
        organizationId: BASE_CLAIMS.organizationId,
        fileHash: BASE_CLAIMS.fileHash,
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_INVALID" }));
  });

  it("rejects a token with the wrong type claim", () => {
    const wrongType = jwt.sign(
      { type: "different-purpose", ...BASE_CLAIMS },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "15m" }
    );
    expect(() =>
      verifyPreviewToken(wrongType, {
        userId: BASE_CLAIMS.userId,
        organizationId: BASE_CLAIMS.organizationId,
        fileHash: BASE_CLAIMS.fileHash,
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_INVALID" }));
  });

  it("rejects a token whose userId does not match the confirm-side user", () => {
    const token = signPreviewToken(BASE_CLAIMS);
    expect(() =>
      verifyPreviewToken(token, {
        userId: "22222222-2222-2222-2222-222222222222",
        organizationId: BASE_CLAIMS.organizationId,
        fileHash: BASE_CLAIMS.fileHash,
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_USER_MISMATCH" }));
  });

  it("rejects a token whose organizationId does not match the confirm-side org", () => {
    const token = signPreviewToken(BASE_CLAIMS);
    expect(() =>
      verifyPreviewToken(token, {
        userId: BASE_CLAIMS.userId,
        organizationId: "other-org",
        fileHash: BASE_CLAIMS.fileHash,
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_ORG_MISMATCH" }));
  });

  it("rejects a token whose fileHash does not match the confirm-side file", () => {
    const token = signPreviewToken(BASE_CLAIMS);
    expect(() =>
      verifyPreviewToken(token, {
        userId: BASE_CLAIMS.userId,
        organizationId: BASE_CLAIMS.organizationId,
        fileHash: "b".repeat(64),
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_FILE_MISMATCH" }));
  });

  it("rejects an expired token", () => {
    // Sign an already-expired token directly; expiresIn:'0s' would be too
    // close to the boundary on a fast machine.
    const expired = jwt.sign(
      { type: "bulk-import-preview", ...BASE_CLAIMS },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: -10 }
    );
    expect(() =>
      verifyPreviewToken(expired, {
        userId: BASE_CLAIMS.userId,
        organizationId: BASE_CLAIMS.organizationId,
        fileHash: BASE_CLAIMS.fileHash,
      })
    ).toThrow(expect.objectContaining({ code: "PREVIEW_TOKEN_EXPIRED" }));
  });
});

describe("signPreviewToken env guards", () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    // Snapshot then clear so the missing-secret test runs in isolation.
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("throws when JWT_SECRET is unset", () => {
    delete process.env.JWT_SECRET;
    expect(() => signPreviewToken(BASE_CLAIMS)).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = originalSecret;
  });
});
