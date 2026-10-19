/**
 * Issue #881 - users.js bulk-upload route plumbing tests.
 *
 * Service-layer logic (validation, token round-trip, dedup, BATCH email
 * priority) is covered by `testing/backend-tests/services/userService.test.js`
 * + `testing/backend-tests/utils/bulkImportPreviewToken.test.js`. This file
 * pins only the HTTP boundary contract:
 *
 *   POST /api/users/bulk-upload/preview
 *     - 400 when no file
 *     - 200 with summary + previewToken on happy path
 *
 *   POST /api/users/bulk-upload/confirm
 *     - 400 when no file
 *     - 400 when previewToken missing from body
 *     - 200 on happy path; previewToken from preview round-trips through
 *
 * All auth / plan / admin middleware is mocked to pass-through. The service
 * functions are mocked so the test does not need a working User table.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Pass-through middleware so we test the route plumbing in isolation.
jest.unstable_mockModule("../../../backend/src/middleware/auth.js", () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: "uploader-uuid", organizationId: "test-org", tenant_id: "tenant-uuid" };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requirePlatformOwner: (_req, _res, next) => next(),
}));

jest.unstable_mockModule("../../../backend/src/middleware/planLimits.js", () => ({
  requireBulkInvitePlan: (_req, _res, next) => next(),
}));

jest.unstable_mockModule("../../../backend/src/middleware/auditLog.js", () => ({
  auditLogger: () => (_req, _res, next) => next(),
  logAuditEvent: jest.fn(async () => {}),
  AuditLog: { create: jest.fn(async () => ({})), query: jest.fn() },
  redactForAudit: (x) => x,
  supportMode: (_req, _res, next) => next(),
  createAuditRoutes: (router) => router,
  default: {},
}));

// Mock the service layer; route should pass req.file.buffer + parsed rows
// through and surface whatever the service returns.
const previewBulkImportMock = jest.fn();
const confirmBulkImportMock = jest.fn();

jest.unstable_mockModule("../../../backend/src/services/userService.js", () => ({
  listUsers: jest.fn(),
  getUserProfile: jest.fn(),
  setAdminFlag: jest.fn(),
  updateUserEmail: jest.fn(),
  triggerPasswordReset: jest.fn(),
  approveUser: jest.fn(),
  addToOrg: jest.fn(),
  removeFromOrg: jest.fn(),
  deleteUser: jest.fn(),
  previewBulkImport: previewBulkImportMock,
  confirmBulkImport: confirmBulkImportMock,
}));

const { default: usersRouter } = await import("../../../backend/src/routes/users.js");
const { ValidationError } = await import("../../../backend/src/services/errors.js");

const app = express();
app.use(express.json());
app.use("/api/users", usersRouter);

const CSV_PAYLOAD = "username,email,password\nadminbob,bob@example.test,Password123\n";

beforeEach(() => {
  previewBulkImportMock.mockReset();
  confirmBulkImportMock.mockReset();
});

// ── /bulk-upload/preview ───────────────────────────────────────────────────

describe("POST /api/users/bulk-upload/preview", () => {
  it("returns 400 when no file is attached", async () => {
    const res = await request(app).post("/api/users/bulk-upload/preview");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No CSV file/i);
    expect(previewBulkImportMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the service result on happy path", async () => {
    previewBulkImportMock.mockResolvedValueOnce({
      summary: { total: 1, wouldCreate: 1, wouldSkip: 0 },
      accepted: [{ row: 2, username: "adminbob" }],
      rejected: [],
      previewToken: "signed.jwt.here",
      fileHash: "f".repeat(64),
    });

    const res = await request(app)
      .post("/api/users/bulk-upload/preview")
      .attach("file", Buffer.from(CSV_PAYLOAD), "staff.csv");

    expect(res.status).toBe(200);
    expect(res.body.previewToken).toBe("signed.jwt.here");
    expect(res.body.summary.wouldCreate).toBe(1);
    expect(previewBulkImportMock).toHaveBeenCalledTimes(1);
  });
});

// ── /bulk-upload/confirm ───────────────────────────────────────────────────

describe("POST /api/users/bulk-upload/confirm", () => {
  it("returns 400 when no file is attached", async () => {
    const res = await request(app).post("/api/users/bulk-upload/confirm");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No CSV file/i);
    expect(confirmBulkImportMock).not.toHaveBeenCalled();
  });

  it("returns 400 when previewToken is missing from the multipart body", async () => {
    const res = await request(app)
      .post("/api/users/bulk-upload/confirm")
      .attach("file", Buffer.from(CSV_PAYLOAD), "staff.csv");
    // No .field("previewToken", ...) call here.

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PREVIEW_TOKEN_MISSING");
    expect(confirmBulkImportMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the service result when file + previewToken present", async () => {
    confirmBulkImportMock.mockResolvedValueOnce({
      success: true,
      summary: { total: 1, successful: 1, failed: 0 },
      results: [{ row: 2, username: "adminbob", success: true }],
      errors: [],
    });

    const res = await request(app)
      .post("/api/users/bulk-upload/confirm")
      .field("previewToken", "signed.jwt.here")
      .attach("file", Buffer.from(CSV_PAYLOAD), "staff.csv");

    expect(res.status).toBe(200);
    expect(res.body.summary.successful).toBe(1);
    expect(confirmBulkImportMock).toHaveBeenCalledTimes(1);
    // Service receives ctx, fileBuffer, rows, previewToken in that order.
    const [, fileBuffer, , token] = confirmBulkImportMock.mock.calls[0];
    expect(fileBuffer).toBeInstanceOf(Buffer);
    expect(token).toBe("signed.jwt.here");
  });

  it("propagates a service-layer ValidationError as 400 with the code", async () => {
    confirmBulkImportMock.mockRejectedValueOnce(
      new ValidationError("Preview token has expired; re-run the preview step", {
        code: "PREVIEW_TOKEN_EXPIRED",
      })
    );

    const res = await request(app)
      .post("/api/users/bulk-upload/confirm")
      .field("previewToken", "expired.jwt.here")
      .attach("file", Buffer.from(CSV_PAYLOAD), "staff.csv");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PREVIEW_TOKEN_EXPIRED");
  });
});
