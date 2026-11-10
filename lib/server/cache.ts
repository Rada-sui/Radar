import "server-only";

/**
 * A small shared fetch layer for free, rate-limited APIs.
 *  - Caches responses for a TTL.
 *  - De-duplicates identical requests that are already in flight.
 *  - Limits calls per minute per upstream, and serves stale data instead of
 *    failing when a limit is hit or the upstream errors.
 * State lives on globalThis so it survives hot reloads and is shared by every
 * route handler in the process. It is per-instance, not distributed.
 */

type Entry = { at: number; value: unknown };

type Store = {
  cache: Map<string, Entry>;
  inflight: Map<string, Promise<unknown>>;
  calls: Map<string, number[]>;
};

const g = globalThis as unknown as { __radarStore?: Store };
const store: Store = (g.__radarStore ??= {
  cache: new Map(),
  inflight: new Map(),
  calls: new Map(),
});

const MAX_ENTRIES = 600;
/** How long past its TTL a cached value may still be served as a fallback. */
const STALE_FACTOR = 20;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limited" | "http" | "network",
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export type FetchOptions = {
  /** Name of the upstream, used for the per-minute budget. */
  bucket: string;
  /** Calls allowed per rolling minute for this bucket. */
  perMinute: number;
  /** Fresh for this many milliseconds. */
  ttlMs: number;
  headers?: Record<string, string>;
  body?: string;
  method?: "GET" | "POST";
  /** Treat these statuses as an empty result instead of an error. */
  emptyOn?: number[];
};

function takeBudget(bucket: string, perMinute: number): boolean {
  const now = Date.now();
  const list = (store.calls.get(bucket) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) {
    store.calls.set(bucket, list);
    return false;
  }
  list.push(now);
  store.calls.set(bucket, list);
  return true;
}

function remember(key: string, value: unknown) {
  store.cache.set(key, { at: Date.now(), value });
  if (store.cache.size > MAX_ENTRIES) {
    const oldest = [...store.cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    for (const [k] of oldest) store.cache.delete(k);
  }
}

export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T | null> {
  const key = `${opts.method ?? "GET"} ${url} ${opts.body ?? ""}`;
  const hit = store.cache.get(key);
  const now = Date.now();

  if (hit && now - hit.at < opts.ttlMs) return hit.value as T | null;

  const pending = store.inflight.get(key);
  if (pending) return (await pending) as T | null;

  const stale = hit && now - hit.at < opts.ttlMs * STALE_FACTOR ? (hit.value as T | null) : undefined;

  const run = (async (): Promise<T | null> => {
    if (!takeBudget(opts.bucket, opts.perMinute)) {
      if (stale !== undefined) return stale;
      throw new UpstreamError(`${opts.bucket} request budget used up for this minute`, "rate_limited");
    }
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { accept: "application/json", ...opts.headers },
        body: opts.body,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      if (stale !== undefined) return stale;
      throw new UpstreamError(`Could not reach ${opts.bucket}`, "network");
    }

    if (opts.emptyOn?.includes(res.status)) {
      remember(key, null);
      return null;
    }
    if (res.status === 429) {
      if (stale !== undefined) return stale;
      throw new UpstreamError(`${opts.bucket} is rate limiting Radar`, "rate_limited", 429);
    }
    if (!res.ok) {
      if (stale !== undefined) return stale;
      throw new UpstreamError(`${opts.bucket} returned ${res.status}`, "http", res.status);
    }
    let json: T;
    try {
      json = (await res.json()) as T;
    } catch {
      if (stale !== undefined) return stale;
      throw new UpstreamError(`${opts.bucket} sent a response Radar could not read`, "http", res.status);
    }
    remember(key, json);
    return json;
  })();

  store.inflight.set(key, run);
  try {
    return await run;
  } finally {
    store.inflight.delete(key);
  }
}

/** Test helper: forget everything. */
export function __resetStore() {
  store.cache.clear();
  store.inflight.clear();
  store.calls.clear();
}
