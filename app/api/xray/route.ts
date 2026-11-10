import type { NextRequest } from "next/server";
import { analyseToken } from "@/lib/server/xray";

export async function GET(request: NextRequest) {
  const ca = request.nextUrl.searchParams.get("ca") ?? "";
  if (ca.length > 300) {
    return Response.json(
      { ok: false, code: "bad_input", error: "That input is too long to be a coin type." },
      { status: 400 },
    );
  }
  const { body, status } = await analyseToken(ca);
  return Response.json(body, {
    status,
    headers: body.ok ? { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } : {},
  });
}
