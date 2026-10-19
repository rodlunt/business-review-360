import { describe, it, expect } from "vitest";
import { fillDailySeries } from "./fillDailySeries";

// Issue #952: the trend chart plotted only days-with-data, so a sparse
// tenant's "Last 30 Days" line spanned months and skipped empty days.
// Control: the window and zero-fill assertions fail against the old
// slice(-30)-of-sparse-rows behaviour.

const NOW = new Date("2026-08-19T10:00:00Z");

describe("fillDailySeries (#952 trend window zero-fill)", () => {
  it("returns exactly one point per day over the window, oldest first", () => {
    const series = fillDailySeries([], 30, NOW);

    expect(series).toHaveLength(30);
    expect(series[0].date).toBe("2026-07-21");
    expect(series[29].date).toBe("2026-08-19");
    expect(series.every((p) => p.count === 0)).toBe(true);
  });

  it("zero-fills the gaps between sparse data points", () => {
    const series = fillDailySeries(
      [
        { date: "2026-08-17", count: "2" },
        { date: "2026-08-19", count: 1 },
      ],
      5,
      NOW
    );

    expect(series).toEqual([
      { date: "2026-08-15", count: 0 },
      { date: "2026-08-16", count: 0 },
      { date: "2026-08-17", count: 2 },
      { date: "2026-08-18", count: 0 },
      { date: "2026-08-19", count: 1 },
    ]);
  });

  it("excludes data older than the window instead of stretching to fit it", () => {
    const series = fillDailySeries(
      [
        { date: "2026-06-09", count: 1 },
        { date: "2026-08-18", count: 1 },
      ],
      30,
      NOW
    );

    expect(series).toHaveLength(30);
    expect(series.find((p) => p.date === "2026-06-09")).toBeUndefined();
    expect(series.find((p) => p.date === "2026-08-18").count).toBe(1);
    expect(series.reduce((sum, p) => sum + p.count, 0)).toBe(1);
  });

  it("skips rows with unparseable dates instead of throwing mid-render", () => {
    const series = fillDailySeries(
      [
        { date: "not-a-date", count: 5 },
        { date: null, count: 2 },
        { date: "2026-08-19", count: 1 },
      ],
      3,
      NOW
    );

    expect(series).toHaveLength(3);
    expect(series[2]).toEqual({ date: "2026-08-19", count: 1 });
    expect(series.reduce((sum, p) => sum + p.count, 0)).toBe(1);
  });

  it("tolerates missing input and non-numeric counts", () => {
    expect(fillDailySeries(undefined, 3, NOW)).toHaveLength(3);
    const series = fillDailySeries([{ date: "2026-08-19", count: "junk" }], 3, NOW);
    expect(series[2]).toEqual({ date: "2026-08-19", count: 0 });
  });
});
