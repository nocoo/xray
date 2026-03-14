// =============================================================================
// POST /api/explore/users/batch
// Resolve multiple usernames to UserInfo objects in parallel.
//
// Body: { usernames: string[] }
// Returns: { success: true, data: { resolved: UserInfo[], failed: string[] } }
// =============================================================================

import { NextRequest } from "next/server";
import { withSessionProvider } from "@/lib/twitter/session-handler";
import { ProfilesRepo } from "@/db/scoped";
import { pMap } from "@/lib/utils";

import type { UserInfo } from "../../../../../../shared/types";

export const dynamic = "force-dynamic";

/** Max usernames per request to prevent abuse */
const MAX_USERNAMES = 500;

/** Concurrency limit for upstream API calls */
const CONCURRENCY = 5;

export async function POST(req: NextRequest) {
  let body: { usernames?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { usernames } = body;

  if (!Array.isArray(usernames) || usernames.length === 0) {
    return Response.json(
      { success: false, error: "Body must contain a non-empty `usernames` array" },
      { status: 400 },
    );
  }

  if (usernames.length > MAX_USERNAMES) {
    return Response.json(
      {
        success: false,
        error: `Too many usernames (max ${MAX_USERNAMES})`,
      },
      { status: 400 },
    );
  }

  // Sanitize: trim, strip @, deduplicate (case-insensitive), remove blanks
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const u of usernames) {
    const s = typeof u === "string" ? u.trim().replace(/^@/, "") : "";
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      cleaned.push(s);
    }
  }

  if (cleaned.length === 0) {
    return Response.json(
      { success: false, error: "No valid usernames provided" },
      { status: 400 },
    );
  }

  return withSessionProvider(async (provider) => {
    const profiles = new ProfilesRepo();
    const resolved: UserInfo[] = [];
    const failed: string[] = [];

    await pMap(
      cleaned,
      async (username) => {
        try {
          const info = await provider.getUserInfo(username);
          profiles.upsert(info);
          resolved.push(info);
        } catch (err) {
          console.error(`[batch] Failed to resolve "${username}":`, err instanceof Error ? err.message : err);
          failed.push(username);
        }
      },
      CONCURRENCY,
    );

    return Response.json({
      success: true,
      data: { resolved, failed },
    });
  });
}
