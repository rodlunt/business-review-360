import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

/**
 * Issue #521: personal changelog -- "X new ideas since your last visit".
 *
 * On mount, fetches the count of ideas created since the user's lastSeenAt.
 * If lastSeenAt is null (first visit), silently initialises it so subsequent
 * visits can show an accurate count.
 */
export function usePersonalChangelog() {
  const [count, setCount] = useState(0);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchChangelog() {
      try {
        const res = await api.get("/ideas/changelog");
        if (cancelled) return;
        const { count: newCount, since } = res.data;
        setCount(newCount);
        if (!since) {
          // First visit: initialise lastSeenAt silently (no banner shown)
          await api.post("/ideas/changelog/dismiss");
        }
      } catch {
        // Non-critical; don't block the page
      } finally {
        if (!cancelled) setInitialized(true);
      }
    }
    fetchChangelog();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(async () => {
    setCount(0);
    try {
      await api.post("/ideas/changelog/dismiss");
    } catch {
      // Non-critical
    }
  }, []);

  return { count, initialized, dismiss };
}
