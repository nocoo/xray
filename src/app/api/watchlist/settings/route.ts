/**
 * GET  /api/watchlist/settings — Read watchlist auto-fetch settings
 * PUT  /api/watchlist/settings — Update watchlist auto-fetch settings
 *
 * Settings stored in the generic settings KV table:
 * - watchlist.fetchIntervalMinutes: auto-fetch interval (0 = disabled)
 * - watchlist.retentionDays: retention window for fetched posts (1, 3, 7)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as settingsRepo from "@/db/repositories/settings";

export const dynamic = "force-dynamic";

const KEY_FETCH_INTERVAL = "watchlist.fetchIntervalMinutes";
const KEY_RETENTION_DAYS = "watchlist.retentionDays";

const VALID_INTERVALS = [0, 5, 10, 15, 30, 60, 120, 360, 720, 1440];
const VALID_RETENTION_DAYS = [1, 3, 7];
const DEFAULT_RETENTION_DAYS = 1;

function readWatchlistSettings(userId: string) {
  const intervalRow = settingsRepo.findByKey(userId, KEY_FETCH_INTERVAL);
  const minutes = intervalRow ? parseInt(intervalRow.value, 10) : 0;

  const retentionRow = settingsRepo.findByKey(userId, KEY_RETENTION_DAYS);
  const days = retentionRow ? parseInt(retentionRow.value, 10) : DEFAULT_RETENTION_DAYS;

  return {
    fetchIntervalMinutes: isNaN(minutes) ? 0 : minutes,
    retentionDays: isNaN(days) ? DEFAULT_RETENTION_DAYS : days,
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

  let body: { fetchIntervalMinutes?: number; retentionDays?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // At least one field must be provided
  if (body.fetchIntervalMinutes === undefined && body.retentionDays === undefined) {
    return NextResponse.json(
      { error: "At least one of fetchIntervalMinutes or retentionDays is required" },
      { status: 400 },
    );
  }

  // Validate and save fetchIntervalMinutes
  if (body.fetchIntervalMinutes !== undefined) {
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
  }

  // Validate and save retentionDays
  if (body.retentionDays !== undefined) {
    const days = body.retentionDays;
    if (!Number.isInteger(days) || !VALID_RETENTION_DAYS.includes(days)) {
      return NextResponse.json(
        {
          error: `Invalid retention. Must be one of: ${VALID_RETENTION_DAYS.join(", ")}`,
        },
        { status: 400 },
      );
    }
    settingsRepo.upsert(user.id, KEY_RETENTION_DAYS, String(days));
  }

  return NextResponse.json({
    success: true,
    data: readWatchlistSettings(user.id),
  });
}
