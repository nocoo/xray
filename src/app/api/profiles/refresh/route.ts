// =============================================================================
// POST /api/profiles/refresh
// Refresh Twitter profile snapshots by fetching latest data from the API.
//
// Body: { twitter_ids?: string[], usernames?: string[] }
//   - At least one of the two arrays must be provided.
//   - For twitter_ids, we look up the existing username from our cache first.
//   - For usernames, we call getUserInfo directly.
//
// Returns: { success: true, data: { resolved: UserInfo[], failed: string[] } }
// =============================================================================

import { NextRequest } from "next/server";
import { withSessionProvider } from "@/lib/twitter/session-handler";
import { ProfilesRepo } from "@/db/scoped";

import type { UserInfo } from "../../../../../shared/types";

export const dynamic = "force-dynamic";

/** Concurrency limit for upstream API calls */
const CONCURRENCY = 5;

/** Max identifiers per request */
const MAX_IDENTIFIERS = 500;

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  let body: { twitter_ids?: unknown; usernames?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { twitter_ids, usernames } = body;

  const ids = Array.isArray(twitter_ids)
    ? twitter_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const names = Array.isArray(usernames)
    ? usernames
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        .map((u) => u.trim().replace(/^@/, ""))
    : [];

  if (ids.length === 0 && names.length === 0) {
    return Response.json(
      { success: false, error: "Provide at least one of `twitter_ids` or `usernames`" },
      { status: 400 },
    );
  }

  if (ids.length + names.length > MAX_IDENTIFIERS) {
    return Response.json(
      { success: false, error: `Too many identifiers (max ${MAX_IDENTIFIERS})` },
      { status: 400 },
    );
  }

  return withSessionProvider(async (provider) => {
    const profiles = new ProfilesRepo();

    // Build a list of usernames to resolve.
    // For twitter_ids, look up the cached username first.
    const toResolve: string[] = [...names];

    if (ids.length > 0) {
      const cached = profiles.findByIds(ids);
      const cachedMap = new Map(cached.map((p) => [p.twitterId, p.username]));

      for (const id of ids) {
        const username = cachedMap.get(id);
        if (username) {
          toResolve.push(username);
        } else {
          // No cached username — try resolving by numeric ID directly
          // (TweAPI accepts numeric IDs as usernames)
          toResolve.push(id);
        }
      }
    }

    // Deduplicate (case-insensitive)
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const u of toResolve) {
      const lower = u.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        unique.push(u);
      }
    }

    const resolved: UserInfo[] = [];
    const failed: string[] = [];

    await pMap(
      unique,
      async (username) => {
        try {
          const info = await provider.getUserInfo(username);
          profiles.upsert(info);
          resolved.push(info);

          // Also fetch the latest tweet to populate last_tweet_at.
          // This is a best-effort call — failure should not block the profile refresh.
          try {
            const tweets = await provider.fetchUserTweets(info.username, { count: 1 });
            if (tweets.length > 0 && tweets[0]!.created_at) {
              profiles.updateLastTweetAt(info.username, tweets[0]!.created_at);
            }
          } catch {
            // Timeline fetch can fail for protected/suspended accounts — silently skip.
          }
        } catch (err) {
          console.error(
            `[profiles/refresh] Failed to resolve "${username}":`,
            err instanceof Error ? err.message : err,
          );
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
