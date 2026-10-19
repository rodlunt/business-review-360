/**
 * Issue #951 -- statuses outside the canonical vocabulary must surface as an
 * "Other" bucket, never vanish from aggregates.
 *
 * Control: the unknown-status tests fail against the pre-#951 code, which
 * dropped any status missing from STATUS_MAPPING on the floor (that drop is
 * how the board report showed "0 Implemented" beside an idea chip reading
 * Implemented on the same page).
 */

import { describe, it, expect, jest } from "@jest/globals";

// analyticsService imports models at module load; mock them so the pure
// helper can be imported without a database.
jest.unstable_mockModule("../../backend/src/models/Idea.js", () => ({
  default: { findAll: jest.fn(), count: jest.fn(), sequelize: {} },
}));
jest.unstable_mockModule("../../backend/src/models/User.js", () => ({
  default: { count: jest.fn() },
}));
jest.unstable_mockModule("../../backend/src/models/Comment.js", () => ({
  default: { count: jest.fn() },
}));
jest.unstable_mockModule("../../backend/src/models/Vote.js", () => ({
  default: { count: jest.fn() },
}));
jest.unstable_mockModule("../../backend/src/utils/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createLogger: jest.fn(),
}));

const { bucketStatusCounts } = await import("../../backend/src/services/analyticsService.js");

describe("Issue #951 -- bucketStatusCounts", () => {
  it("routes an unknown status into Other and names it in unmapped", () => {
    const { counts, unmapped } = bucketStatusCounts([
      { status: "Reviewing", count: "8" },
      { status: "Implemented", count: "2" },
    ]);

    expect(counts).toEqual({ Reviewing: 8, Other: 2 });
    expect(unmapped).toEqual(["Implemented"]);
  });

  it("aggregates legacy aliases into their canonical status", () => {
    const { counts, unmapped } = bucketStatusCounts([
      { status: "Complete", count: "1" },
      { status: "Closed - Completed", count: "3" },
      { status: "Under Review", count: "2" },
    ]);

    expect(counts).toEqual({ Complete: 4, Reviewing: 2 });
    expect(unmapped).toEqual([]);
  });

  it("accumulates multiple unknown statuses without losing any count", () => {
    const { counts, unmapped } = bucketStatusCounts([
      { status: "Implemented", count: 2 },
      { status: "Parked", count: 1 },
    ]);

    expect(counts).toEqual({ Other: 3 });
    expect(unmapped).toEqual(["Implemented", "Parked"]);
  });

  it("returns empty structures for no rows", () => {
    expect(bucketStatusCounts([])).toEqual({ counts: {}, unmapped: [] });
  });

  it("routes a NULL status into Other (SQL NOT IN can never match NULL, so the old guard missed these)", () => {
    const { counts, unmapped } = bucketStatusCounts([
      { status: null, count: "1" },
      { status: "Reviewing", count: "2" },
    ]);

    expect(counts).toEqual({ Other: 1, Reviewing: 2 });
    expect(unmapped).toEqual([null]);
  });

  it("treats a malformed count as zero instead of poisoning the bucket with NaN", () => {
    const { counts } = bucketStatusCounts([
      { status: "Reviewing", count: "junk" },
      { status: "Reviewing", count: 3 },
    ]);

    expect(counts).toEqual({ Reviewing: 3 });
  });
});
