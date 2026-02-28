/**
 * POST /api/watchlist/fetch
 *
 * Trigger a fetch for all watchlist members of the current user.
 * Fetches tweets via the user's TweAPI credentials, deduplicates against
 * existing fetched_posts, and stores new ones.
 *
 * Retention policy:
 * - Tweets older than the user's retentionDays setting are NOT saved.
 * - Posts older than 7 days (max retention window) are purged on every fetch.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as watchlistRepo from "@/db/repositories/watchlist";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import * as settingsRepo from "@/db/repositories/settings";
import { createProviderForUser } from "@/lib/twitter/provider-factory";

export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 7;

function getRetentionDays(userId: string): number {
  const row = settingsRepo.findByKey(userId, "watchlist.retentionDays");
  if (!row) return DEFAULT_RETENTION_DAYS;
  const days = parseInt(row.value, 10);
  return isNaN(days) ? DEFAULT_RETENTION_DAYS : days;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Create Twitter provider for this user
  const provider = createProviderForUser(user.id);
  if (!provider) {
    return NextResponse.json(
      { error: "API credentials not configured. Set up your TweAPI key first." },
      { status: 503 },
    );
  }

  const members = watchlistRepo.findByUserId(user.id);
  if (members.length === 0) {
    return NextResponse.json({
      success: true,
      data: { fetched: 0, newPosts: 0, skippedOld: 0, purged: 0, errors: [] },
    });
  }

  // Retention: compute cutoff for filtering incoming tweets
  const retentionDays = getRetentionDays(user.id);
  const retentionCutoff = daysAgoIso(retentionDays);

  // Purge: always remove posts older than the max retention (7 days)
  const purgeCutoff = daysAgoIso(MAX_RETENTION_DAYS);
  const purged = fetchedPostsRepo.purgeOlderThan(user.id, purgeCutoff);

  let totalNew = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const member of members) {
    try {
      const tweets = await provider.fetchUserTweets(member.twitterUsername);

      const posts = [];
      for (const tweet of tweets) {
        // Skip tweets older than retention window
        if (tweet.created_at < retentionCutoff) {
          totalSkipped++;
          continue;
        }
        posts.push({
          userId: user.id,
          memberId: member.id,
          tweetId: tweet.id,
          twitterUsername: member.twitterUsername,
          text: tweet.text,
          tweetJson: JSON.stringify(tweet),
          tweetCreatedAt: tweet.created_at,
        });
      }

      const inserted = fetchedPostsRepo.insertMany(posts);
      totalNew += inserted;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`@${member.twitterUsername}: ${message}`);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      fetched: members.length,
      newPosts: totalNew,
      skippedOld: totalSkipped,
      purged,
      errors,
    },
  });
}
