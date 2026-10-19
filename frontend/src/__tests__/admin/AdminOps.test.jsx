import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Recharts' ResponsiveContainer relies on ResizeObserver, which jsdom does
// not implement. Stub the pieces AdminOps.jsx uses with simple passthrough
// components -- this test exercises AdminOps' own fetch/state logic and
// rendered DOM, not Recharts' internal chart-sizing behaviour.
vi.mock("recharts", () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

import AdminOps from "../../admin/AdminOps";

const mockMetricsResponse = {
  errorSeries: [
    { bucket: "2026-08-19T00:00:00.000Z", count: 1 },
    { bucket: "2026-08-19T01:00:00.000Z", count: 0 },
  ],
  queueSeries: [{ sampledAt: "2026-08-19T01:00:00.000Z", pending: 4, failed: 1 }],
  totals: { errors24h: 3, currentPending: 4, currentFailed: 1 },
};

function mockFetchOnce(body, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.setItem("token", "test-token");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminOps", () => {
  it("fetches metrics with the default 24h window on mount and renders the stat row", async () => {
    const fetchMock = mockFetchOnce(mockMetricsResponse);

    render(<AdminOps />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/internal/ops/metrics?hours=24",
        expect.objectContaining({ headers: expect.any(Object) })
      )
    );

    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    expect(screen.getByText("Errors (last 24h)")).toBeInTheDocument();
    expect(screen.getByText("Current queue pending")).toBeInTheDocument();
    expect(screen.getByText("Current queue failed")).toBeInTheDocument();
  });

  it("re-fetches with hours=168 when the 7d range tab is selected", async () => {
    const initialFetch = mockFetchOnce(mockMetricsResponse);
    render(<AdminOps />);

    await waitFor(() => expect(initialFetch).toHaveBeenCalledTimes(1));

    const rangeFetch = mockFetchOnce(mockMetricsResponse);
    fireEvent.click(screen.getByRole("tab", { name: "7d" }));

    await waitFor(() =>
      expect(rangeFetch).toHaveBeenCalledWith(
        "/api/internal/ops/metrics?hours=168",
        expect.anything()
      )
    );
  });

  it("re-fetches with hours=720 when the 30d range tab is selected", async () => {
    const initialFetch = mockFetchOnce(mockMetricsResponse);
    render(<AdminOps />);

    await waitFor(() => expect(initialFetch).toHaveBeenCalledTimes(1));

    const rangeFetch = mockFetchOnce(mockMetricsResponse);
    fireEvent.click(screen.getByRole("tab", { name: "30d" }));

    await waitFor(() =>
      expect(rangeFetch).toHaveBeenCalledWith(
        "/api/internal/ops/metrics?hours=720",
        expect.anything()
      )
    );
  });

  it("shows an error alert when the fetch fails", async () => {
    mockFetchOnce({}, false);
    render(<AdminOps />);

    await waitFor(() => expect(screen.getByText("HTTP 500")).toBeInTheDocument());
  });
});
