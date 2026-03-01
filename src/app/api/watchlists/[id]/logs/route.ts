/**
 * GET /api/watchlists/[id]/logs
 *
 * Returns fetch/translate log history for a specific watchlist.
 * Query params: ?limit=50 (default 50, max 200)
 */

import { NextResponse } from "next/server";
import { requireAuthWithWatchlist } from "@/lib/api-helpers";
import * as fetchLogsRepo from "@/db/repositories/fetch-logs";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: RouteContext) {
  const { error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
  if (error) return error;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  let limit = 50;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 200);
    }
  }

  const logs = fetchLogsRepo.findByWatchlistId(watchlistId, limit);

  // Parse the JSON errors string back to arrays for the client
  const data = logs.map((log) => {
    let errors: string[] = [];
    if (log.errors) {
      try {
        errors = JSON.parse(log.errors);
      } catch {
        errors = [log.errors];
      }
    }
    return {
      id: log.id,
      type: log.type,
      attempted: log.attempted,
      succeeded: log.succeeded,
      skipped: log.skipped,
      purged: log.purged,
      errorCount: log.errorCount,
      errors,
      createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
    };
  });

  return NextResponse.json({ success: true, data });
}
