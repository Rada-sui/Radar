import { getLeaderBoard } from "@/lib/server/leaderboard";

export async function GET() {
  const res = await getLeaderBoard();
  return Response.json(res, {
    status: res.ok ? 200 : 503,
    headers: res.ok ? { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } : {},
  });
}
