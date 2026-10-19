import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useIdeasPage } from "../../hooks/useIdeasPage";

vi.mock("../../api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "../../api";

function makePage(ideas, page = 1, total = ideas.length, limit = 50) {
  const totalPages = Math.ceil(total / limit);
  return {
    data: {
      ideas,
      pagination: { page, limit, totalItems: total, totalPages, hasMore: page < totalPages },
    },
  };
}

const IDEA_A = { id: "1", title: "Idea A" };
const IDEA_B = { id: "2", title: "Idea B" };
const IDEA_C = { id: "3", title: "Idea C" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useIdeasPage", () => {
  it("fetches the first page on mount and returns items", async () => {
    api.get.mockResolvedValueOnce(makePage([IDEA_A, IDEA_B]));

    const { result } = renderHook(() => useIdeasPage());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][0]).toMatch(/\/ideas\?/);
    expect(api.get.mock.calls[0][0]).not.toContain("limit=10000");
    expect(result.current.items).toEqual([IDEA_A, IDEA_B]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("accumulates items across loadMore calls", async () => {
    api.get
      .mockResolvedValueOnce(makePage([IDEA_A, IDEA_B], 1, 3, 2))
      .mockResolvedValueOnce(makePage([IDEA_C], 2, 3, 2));

    const { result } = renderHook(() => useIdeasPage({ limit: 2 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(true);
    expect(result.current.items).toEqual([IDEA_A, IDEA_B]);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    expect(result.current.items).toEqual([IDEA_A, IDEA_B, IDEA_C]);
    expect(result.current.hasMore).toBe(false);
  });

  it("sets error on fetch failure and clears items", async () => {
    api.get.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useIdeasPage());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeTruthy();
    expect(result.current.hasMore).toBe(false);
  });

  it("retries from page 1 and clears error on success", async () => {
    api.get
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(makePage([IDEA_A]));

    const { result } = renderHook(() => useIdeasPage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([IDEA_A]);
    expect(result.current.error).toBeNull();
  });

  it("resets items and re-fetches when sort changes", async () => {
    api.get.mockResolvedValueOnce(makePage([IDEA_A])).mockResolvedValueOnce(makePage([IDEA_B]));

    const { result, rerender } = renderHook(({ sort }) => useIdeasPage({ sort }), {
      initialProps: { sort: "trending" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([IDEA_A]);

    rerender({ sort: "newest" });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([IDEA_B]);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get.mock.calls[1][0]).toContain("sort=newest");
  });

  it("passes category and status as query params when set", async () => {
    api.get.mockResolvedValueOnce(makePage([IDEA_A]));

    const { result } = renderHook(() => useIdeasPage({ category: "Tech", status: "Open" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const url = api.get.mock.calls[0][0];
    expect(url).toContain("category=Tech");
    expect(url).toContain("status=Open");
  });

  it('does not pass category/status when set to "all"', async () => {
    api.get.mockResolvedValueOnce(makePage([IDEA_A]));

    const { result } = renderHook(() => useIdeasPage({ category: "all", status: "all" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const url = api.get.mock.calls[0][0];
    expect(url).not.toContain("category=");
    expect(url).not.toContain("status=");
  });
});
