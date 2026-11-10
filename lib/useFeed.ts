"use client";

import { useCallback, useEffect, useState } from "react";

type Loaded<T> = { url: string; data: T | null; error: string | null };

/**
 * Loads JSON from one of Radar's own API routes and refreshes it on an
 * interval. `loading` is true until the first response for the current URL.
 */
export function useFeed<T>(url: string, refreshMs = 60_000) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<T>)
      .then((data) => setLoaded({ url, data, error: null }))
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        setLoaded((prev) => ({
          url,
          data: prev && prev.url === url ? prev.data : null,
          error: "Could not reach Radar. Check your connection.",
        }));
      });
    return () => ctrl.abort();
  }, [url, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const current = loaded && loaded.url === url ? loaded : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    reload,
  };
}
