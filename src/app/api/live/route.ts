// GET /api/live — surety-standard liveness check (no auth required)
import { APP_VERSION } from "@/lib/version";
import { getDb, getRawSqlite } from "@/db";

export const dynamic = "force-dynamic";

type LiveResponse = {
  status: "ok" | "error";
  version: string;
  component: string;
  timestamp: string;
  uptime: number;
  database?: { connected: boolean; error?: string };
};

function sanitize(msg: string): string {
  return msg.replace(/\bok\b/gi, "***");
}

function probeDatabase(): { connected: boolean; error?: string } {
  try {
    getDb();
    const raw = getRawSqlite();
    const row = raw.prepare("SELECT 1 AS probe").get() as { probe: number };
    if (row?.probe === 1) {
      return { connected: true };
    }
    return { connected: false, error: "probe returned unexpected result" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { connected: false, error: sanitize(msg) };
  }
}

export async function GET() {
  const database = probeDatabase();
  const healthy = database.connected;

  const body: LiveResponse = {
    status: healthy ? "ok" : "error",
    version: APP_VERSION,
    component: "xray",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database,
  };

  return Response.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
