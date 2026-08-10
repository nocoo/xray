// =============================================================================
// GET /api/usage — Usage statistics for the authenticated user
//
// Query params:
//   days=N  (default 30) — number of days to look back
// =============================================================================

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { db, error } = await requireAuth();
  if (error) return error;

  const url = new URL(req.url);
  const days = Math.min(
    Math.max(
      parseInt(url.searchParams.get("days") ?? "30", 10) || 30,
      1,
    ),
    365,
  );

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const summary = db.usageStats.getSummary();
  const endpoints = db.usageStats.getEndpointBreakdown(startDate, endDate);
  const daily = db.usageStats.getDailyTotals(startDate, endDate);

  // Fill in missing dates with 0
  const filledDaily = fillDates(startDate, endDate, daily);

  return Response.json({
    summary: {
      totalRequests: summary.totalRequests,
      uniqueEndpoints: summary.uniqueEndpoints,
      lastUsedAt: summary.lastUsedAt?.toISOString() ?? null,
    },
    endpoints,
    daily: filledDaily,
    range: { startDate, endDate, days },
  });
}

/** Fill gaps in daily data with zero-value entries. */
function fillDates(
  start: string,
  end: string,
  data: { date: string; total: number }[],
): { date: string; total: number }[] {
  const map = new Map(data.map((d) => [d.date, d.total]));
  const result: { date: string; total: number }[] = [];
  const current = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");

  while (current <= last) {
    const dateStr = current.toISOString().slice(0, 10);
    result.push({ date: dateStr, total: map.get(dateStr) ?? 0 });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}
