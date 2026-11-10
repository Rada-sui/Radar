import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { __resetStore, fetchJson, UpstreamError } from "@/lib/server/cache";

const realFetch = globalThis.fetch;
let calls = 0;

function stub(impl: () => Response | Promise<Response>) {
  calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return impl();
  }) as typeof fetch;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const opts = { bucket: "test", perMinute: 100, ttlMs: 1000 };

beforeEach(() => __resetStore());
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchJson", () => {
  it("serves repeat requests from cache within the TTL", async () => {
    stub(() => json({ n: 1 }));
    await fetchJson("https://x.test/a", opts);
    await fetchJson("https://x.test/a", opts);
    assert.equal(calls, 1);
  });

  it("shares one upstream call between simultaneous identical requests", async () => {
    stub(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return json({ n: 1 });
    });
    const [a, b, c] = await Promise.all([
      fetchJson("https://x.test/b", opts),
      fetchJson("https://x.test/b", opts),
      fetchJson("https://x.test/b", opts),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
  });

  it("stops calling the upstream once the per-minute budget is used", async () => {
    stub(() => json({ ok: true }));
    const o = { ...opts, perMinute: 2 };
    await fetchJson("https://x.test/1", o);
    await fetchJson("https://x.test/2", o);
    await assert.rejects(
      () => fetchJson("https://x.test/3", o),
      (e: unknown) => e instanceof UpstreamError && e.kind === "rate_limited",
    );
    assert.equal(calls, 2);
  });

  it("serves stale data instead of failing when the upstream errors", async () => {
    stub(() => json({ v: "first" }));
    const o = { ...opts, ttlMs: 5 };
    await fetchJson("https://x.test/s", o);
    await new Promise((r) => setTimeout(r, 15));
    stub(() => json({ error: "boom" }, 500));
    const got = await fetchJson<{ v: string }>("https://x.test/s", o);
    assert.equal(got?.v, "first");
  });

  it("serves stale data when the upstream returns 429", async () => {
    stub(() => json({ v: "kept" }));
    const o = { ...opts, ttlMs: 5 };
    await fetchJson("https://x.test/t", o);
    await new Promise((r) => setTimeout(r, 15));
    stub(() => json({}, 429));
    const got = await fetchJson<{ v: string }>("https://x.test/t", o);
    assert.equal(got?.v, "kept");
  });

  it("throws a typed error when there is nothing stale to fall back on", async () => {
    stub(() => json({}, 500));
    await assert.rejects(
      () => fetchJson("https://x.test/u", opts),
      (e: unknown) => e instanceof UpstreamError && e.kind === "http" && e.status === 500,
    );
  });

  it("reports a network failure as a network error", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(
      () => fetchJson("https://x.test/v", opts),
      (e: unknown) => e instanceof UpstreamError && e.kind === "network",
    );
  });

  it("treats configured statuses as an empty result, and caches that", async () => {
    stub(() => json({}, 404));
    const o = { ...opts, emptyOn: [404] };
    assert.equal(await fetchJson("https://x.test/w", o), null);
    assert.equal(await fetchJson("https://x.test/w", o), null);
    assert.equal(calls, 1);
  });
});
