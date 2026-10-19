/**
 * Issue #865 — Bulk staff-import caps (pure unit tests).
 *
 * The cap constants are read at module load from env, so this file sets
 * small env values BEFORE the dynamic import so every test runs against
 * a tight budget without needing to seed thousands of fake users.
 *
 * Verifies:
 *   - per-import cap rejects when rows > BULK_IMPORT_MAX_PER_IMPORT
 *   - per-org 30d cap rejects when existing + requested > BULK_IMPORT_MAX_PER_ORG_30D
 *   - both caps pass within budget
 *   - scheduledForBulkInvite staggers correctly across the BATCH-per-hour boundary
 *   - missing organizationId throws TENANT_REQUIRED
 */
process.env.BULK_IMPORT_MAX_PER_IMPORT = "3";
process.env.BULK_IMPORT_MAX_PER_ORG_30D = "5";
process.env.EMAIL_BULK_RESERVE_FRACTION = "0.5";
process.env.EMAIL_QUEUE_RATE_LIMIT = "10"; // BULK_BATCH_PER_HOUR = floor(0.5 * 10) = 5

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockUser = {
  count: jest.fn(),
};

jest.unstable_mockModule("../../../backend/src/models/User.js", () => ({
  default: mockUser,
}));

const {
  assertBulkImportWithinCaps,
  scheduledForBulkInvite,
  BULK_IMPORT_MAX_PER_IMPORT,
  BULK_IMPORT_MAX_PER_ORG_30D,
  BULK_BATCH_PER_HOUR,
} = await import("../../../backend/src/services/bulkImportCaps.js");

const { ForbiddenError } = await import("../../../backend/src/services/errors.js");

describe("bulkImportCaps - constants", () => {
  it("reads env values at module load", () => {
    expect(BULK_IMPORT_MAX_PER_IMPORT).toBe(3);
    expect(BULK_IMPORT_MAX_PER_ORG_30D).toBe(5);
    expect(BULK_BATCH_PER_HOUR).toBe(5); // floor((1 - 0.5) * 10)
  });
});

describe("assertBulkImportWithinCaps", () => {
  beforeEach(() => {
    mockUser.count.mockReset();
  });

  it("throws TENANT_REQUIRED when organizationId is missing", async () => {
    await expect(
      assertBulkImportWithinCaps({ organizationId: null, requestedCount: 1 })
    ).rejects.toMatchObject({ code: "TENANT_REQUIRED" });
  });

  it("throws BULK_IMPORT_CAP_EXCEEDED (perImport) when requested > per-import cap", async () => {
    mockUser.count.mockResolvedValue(0);
    await expect(
      assertBulkImportWithinCaps({ organizationId: "org-1", requestedCount: 4 })
    ).rejects.toMatchObject({
      code: "BULK_IMPORT_CAP_EXCEEDED",
      details: { cap: "perImport", requested: 4, max: 3 },
    });
    // Per-import is checked BEFORE the 30d count (cheaper); count should not run
    expect(mockUser.count).not.toHaveBeenCalled();
  });

  it("throws BULK_IMPORT_CAP_EXCEEDED (perOrg30d) when existing + requested > 30d cap", async () => {
    mockUser.count.mockResolvedValue(4); // 4 existing, requesting 2 -> 6 > 5
    await expect(
      assertBulkImportWithinCaps({ organizationId: "org-1", requestedCount: 2 })
    ).rejects.toMatchObject({
      code: "BULK_IMPORT_CAP_EXCEEDED",
      details: { cap: "perOrg30d", existing: 4, requested: 2, max: 5 },
    });
  });

  it("passes when both caps satisfied", async () => {
    mockUser.count.mockResolvedValue(2); // 2 existing, requesting 3 -> 5 == 5 (boundary)
    await expect(
      assertBulkImportWithinCaps({ organizationId: "org-1", requestedCount: 3 })
    ).resolves.toBeUndefined();
  });

  it("per-org 30d query is scoped to the org and a 30-day window", async () => {
    mockUser.count.mockResolvedValue(0);
    await assertBulkImportWithinCaps({ organizationId: "org-xyz", requestedCount: 1 });
    expect(mockUser.count).toHaveBeenCalledTimes(1);
    const call = mockUser.count.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-xyz");
    const since = call.where.createdAt[Object.getOwnPropertySymbols(call.where.createdAt)[0]];
    expect(since).toBeInstanceOf(Date);
    const ageMs = Date.now() - since.getTime();
    // Should be approximately 30 days ago (within 1 minute of test runtime)
    expect(ageMs).toBeGreaterThan(30 * 24 * 60 * 60 * 1000 - 60 * 1000);
    expect(ageMs).toBeLessThan(30 * 24 * 60 * 60 * 1000 + 60 * 1000);
  });

  it("produces a ForbiddenError (extends ServiceError) so the route layer maps it to 403", async () => {
    mockUser.count.mockResolvedValue(0);
    try {
      await assertBulkImportWithinCaps({ organizationId: "org-1", requestedCount: 99 });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err.statusCode).toBe(403);
    }
  });
});

describe("scheduledForBulkInvite", () => {
  const base = new Date("2026-05-20T10:00:00.000Z");

  it("returns the base time for the first invite", () => {
    expect(scheduledForBulkInvite(0, base).toISOString()).toBe("2026-05-20T10:00:00.000Z");
  });

  it("keeps the same hour for indices within the first BATCH-per-hour slot", () => {
    // BULK_BATCH_PER_HOUR = 5 -> indices 0..4 all schedule for the base hour
    expect(scheduledForBulkInvite(4, base).toISOString()).toBe("2026-05-20T10:00:00.000Z");
  });

  it("advances by one hour at the BATCH-per-hour boundary", () => {
    expect(scheduledForBulkInvite(5, base).toISOString()).toBe("2026-05-20T11:00:00.000Z");
    expect(scheduledForBulkInvite(9, base).toISOString()).toBe("2026-05-20T11:00:00.000Z");
    expect(scheduledForBulkInvite(10, base).toISOString()).toBe("2026-05-20T12:00:00.000Z");
  });

  it("defaults `now` to current time when omitted", () => {
    const before = Date.now();
    const sched = scheduledForBulkInvite(0);
    const after = Date.now();
    expect(sched.getTime()).toBeGreaterThanOrEqual(before);
    expect(sched.getTime()).toBeLessThanOrEqual(after);
  });
});
