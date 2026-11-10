import "server-only";
import { momentumOf } from "./analysis";
import { newTokens, topTokens, trendingTokens } from "./gecko";
import { UpstreamError } from "./cache";
import type { RadarFeed, RadarView } from "@/lib/types";

export function parseView(v: string | null): RadarView {
  return v === "new" || v === "top" ? v : "trending";
}

export async function buildRadarFeed(view: RadarView): Promise<{ feed: RadarFeed; status: number }> {
  try {
    const tokens =
      view === "new" ? await newTokens() : view === "top" ? await topTokens() : await trendingTokens("1h");
    return {
      feed: { ok: true, view, tokens, momentum: momentumOf(tokens), updatedAt: Date.now() },
      status: 200,
    };
  } catch (e) {
    if (e instanceof UpstreamError && e.kind === "rate_limited") {
      return { feed: { ok: false, error: "The free data source is busy. Try again in a minute." }, status: 429 };
    }
    return { feed: { ok: false, error: "The market data source did not respond." }, status: 502 };
  }
}
