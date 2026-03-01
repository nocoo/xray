/**
 * GET  /api/watchlists/[id]/settings — Read per-watchlist settings
 * PUT  /api/watchlists/[id]/settings — Update per-watchlist settings
 *
 * Settings stored in the generic settings KV table with per-watchlist key namespacing:
 * - watchlist.{id}.fetchIntervalMinutes: auto-fetch interval (0 = disabled)
 * - watchlist.{id}.retentionDays: retention window for fetched posts (1, 3, 7)
 *
 * Falls back to global settings if per-watchlist settings are not set.
 */

import { NextResponse } from "next/server";
import { requireAuthWithWatchlist } from "@/lib/api-helpers";
import * as settingsRepo from "@/db/repositories/settings";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_INTERVALS = [0, 5, 10, 15, 30, 60, 120, 360, 720, 1440];
const VALID_RETENTION_DAYS = [1, 3, 7];
const DEFAULT_RETENTION_DAYS = 1;

function readSettings(userId: string, watchlistId: number) {
  // Per-watchlist keys take precedence over global keys
  const intervalKey = `watchlist.${watchlistId}.fetchIntervalMinutes`;
  const retentionKey = `watchlist.${watchlistId}.retentionDays`;

  let intervalRow = settingsRepo.findByKey(userId, intervalKey);
  if (!intervalRow) {
    intervalRow = settingsRepo.findByKey(userId, "watchlist.fetchIntervalMinutes");
  }
  const minutes = intervalRow ? parseInt(intervalRow.value, 10) : 0;

  let retentionRow = settingsRepo.findByKey(userId, retentionKey);
  if (!retentionRow) {
    retentionRow = settingsRepo.findByKey(userId, "watchlist.retentionDays");
  }
  const days = retentionRow ? parseInt(retentionRow.value, 10) : DEFAULT_RETENTION_DAYS;

  return {
    fetchIntervalMinutes: isNaN(minutes) ? 0 : minutes,
    retentionDays: isNaN(days) ? DEFAULT_RETENTION_DAYS : days,
  };
}

export async function GET(_request: Request, ctx: RouteContext) {
  const { user, error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
  if (error) return error;

  return NextResponse.json({
    success: true,
    data: readSettings(user.id, watchlistId),
  });
}

export async function PUT(request: Request, ctx: RouteContext) {
  const { user, error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
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
    settingsRepo.upsert(user.id, `watchlist.${watchlistId}.fetchIntervalMinutes`, String(minutes));
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
    settingsRepo.upsert(user.id, `watchlist.${watchlistId}.retentionDays`, String(days));
  }

  return NextResponse.json({
    success: true,
    data: readSettings(user.id, watchlistId),
  });
}
