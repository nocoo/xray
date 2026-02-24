import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/live
 * Unauthenticated health check endpoint.
 * Returns system status and basic diagnostics.
 */
export async function GET() {
  const now = Date.now();
  let dbOk = false;

  try {
    const { db } = await import("@/db");
    // Simple query to verify DB connectivity — if the proxy resolves
    // and the query executes without throwing, the DB is reachable.
    db.query.users.findFirst();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? "ok" : "degraded";

  return NextResponse.json({
    status,
    timestamp: now,
    uptime: Math.floor(process.uptime()),
    checks: {
      database: dbOk ? "ok" : "error",
    },
  });
}
