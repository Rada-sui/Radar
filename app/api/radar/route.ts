import type { NextRequest } from "next/server";
import { buildRadarFeed, parseView } from "@/lib/server/radar";

export async function GET(request: NextRequest) {
  const view = parseView(request.nextUrl.searchParams.get("view"));
  const { feed, status } = await buildRadarFeed(view);
  return Response.json(feed, {
    status,
    headers: feed.ok ? { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } : {},
  });
}
