import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

export const IDEAS_PAGE_LIMIT = 50;

export function useIdeasPage({
  sort = "trending",
  category,
  status,
  search,
  quadrant,
  limit = IDEAS_PAGE_LIMIT,
  refresh = 0,
} = {}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setItems([]);
    setPage(1);
    setHasMore(false);
    setTotal(0);
    setLoading(true);
    setError(null);

    const params = buildParams({ page: 1, limit, sort, category, status, search, quadrant });

    api
      .get(`/ideas?${params}`)
      .then((res) => {
        if (cancelled) return;
        const { ideas, pagination } = res.data;
        setItems(ideas);
        setHasMore(pagination.hasMore);
        setTotal(pagination.totalItems);
        setPage(1);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load ideas. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sort, category, status, search, quadrant, limit, refresh, retryCount]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;

    const nextPage = page + 1;
    setIsLoadingMore(true);

    const params = buildParams({ page: nextPage, limit, sort, category, status, search, quadrant });

    api
      .get(`/ideas?${params}`)
      .then((res) => {
        const { ideas, pagination } = res.data;
        setItems((prev) => [...prev, ...ideas]);
        setHasMore(pagination.hasMore);
        setPage(nextPage);
      })
      .catch(() => {
        setError("Failed to load more ideas. Please try again.");
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [hasMore, isLoadingMore, page, sort, category, status, search, quadrant, limit]);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  return { items, hasMore, total, loading, isLoadingMore, error, loadMore, retry };
}

function buildParams({ page, limit, sort, category, status, search, quadrant }) {
  const params = new URLSearchParams({ page, limit, sort });
  if (category && category !== "all") params.set("category", category);
  if (status && status !== "all") params.set("status", status);
  if (search) params.set("search", search);
  if (quadrant) params.set("quadrant", quadrant);
  return params;
}
