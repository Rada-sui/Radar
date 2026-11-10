import { getReport } from "@/lib/server/report";

export async function GET() {
  const { body, status } = await getReport();
  return Response.json(body, {
    status,
    headers: body.ok ? { "cache-control": "public, s-maxage=120, stale-while-revalidate=300" } : {},
  });
}
