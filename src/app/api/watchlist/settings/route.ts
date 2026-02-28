/**
 * GET  /api/watchlist/settings — Read watchlist auto-fetch settings
 * PUT  /api/watchlist/settings — Update watchlist auto-fetch settings
 *
 * Settings stored in the generic settings KV table:
 * - watchlist.fetchIntervalMinutes: auto-fetch interval (0 = disabled)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as settingsRepo from "@/db/repositories/settings";

export const dynamic = "force-dynamic";

const KEY_FETCH_INTERVAL = "watchlist.fetchIntervalMinutes";

const VALID_INTERVALS = [0, 5, 10, 15, 30, 60, 120, 360, 720, 1440];

function readWatchlistSettings(userId: string) {
  const row = settingsRepo.findByKey(userId, KEY_FETCH_INTERVAL);
  const minutes = row ? parseInt(row.value, 10) : 0;
  return {
    fetchIntervalMinutes: isNaN(minutes) ? 0 : minutes,
  };
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  return NextResponse.json({
    success: true,
    data: readWatchlistSettings(user.id),
  });
}

export async function PUT(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { fetchIntervalMinutes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.fetchIntervalMinutes === undefined) {
    return NextResponse.json(
      { error: "fetchIntervalMinutes is required" },
      { status: 400 },
    );
  }

  const minutes = body.fetchIntervalMinutes;
  if (!Number.isInteger(minutes) || !VALID_INTERVALS.includes(minutes)) {
    return NextResponse.json(
      {
        error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  settingsRepo.upsert(user.id, KEY_FETCH_INTERVAL, String(minutes));

  return NextResponse.json({
    success: true,
    data: readWatchlistSettings(user.id),
  });
}
