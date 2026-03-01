/**
 * POST /api/watchlist/fetch
 *
 * Trigger a fetch for all watchlist members of the current user.
 * Returns a Server-Sent Events (SSE) stream with per-member progress.
 *
 * Event types:
 *   - cleanup:  { purgedExpired, purgedOrphans }
 *   - progress: { current, total, username, tweetsReceived, filtered, newPosts, error? }
 *   - posts:    { posts: FetchedPostData[] }   — newly inserted posts for real-time rendering
 *   - done:     { fetched, newPosts, skippedOld, purged, errors }
 *
 * Retention policy:
 * - Tweets older than the user's retentionDays setting are NOT saved.
 * - Posts older than 7 days (max retention window) are purged on every fetch.
 * - Posts for removed watchlist members (orphans) are purged on every fetch.
 */

import { requireAuth } from "@/lib/api-helpers";
import * as watchlistRepo from "@/db/repositories/watchlist";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import * as fetchLogsRepo from "@/db/repositories/fetch-logs";
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

/** Format an SSE message. */
function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Create Twitter provider for this user
  const provider = createProviderForUser(user.id);
  if (!provider) {
    return new Response(
      JSON.stringify({
        error:
          "API credentials not configured. Set up your TweAPI key first.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const members = watchlistRepo.findByUserId(user.id);
  if (members.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          fetched: 0,
          newPosts: 0,
          skippedOld: 0,
          purged: 0,
          errors: [],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // Retention: compute cutoff for filtering incoming tweets
  const retentionDays = getRetentionDays(user.id);
  const retentionCutoff = daysAgoIso(retentionDays);

  // Purge: always remove posts older than the max retention (7 days)
  const purgeCutoff = daysAgoIso(MAX_RETENTION_DAYS);
  const purged = fetchedPostsRepo.purgeOlderThan(user.id, purgeCutoff);

  // Purge orphaned posts (from members no longer in the watchlist)
  const activeMemberIds = members.map((m) => m.id);
  const purgedOrphans = fetchedPostsRepo.purgeOrphaned(user.id, activeMemberIds);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Emit cleanup event so the client knows stale posts were removed
      if (purged > 0 || purgedOrphans > 0) {
        controller.enqueue(
          encoder.encode(
            sseMessage("cleanup", {
              purgedExpired: purged,
              purgedOrphans,
            }),
          ),
        );
      }

      let totalNew = 0;
      let totalSkipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < members.length; i++) {
        const member = members[i]!;
        let memberNew = 0;
        let memberError: string | undefined;
        let memberTweetsReceived = 0;
        let memberFiltered = 0;

        try {
          const tweets = await provider.fetchUserTweets(
            member.twitterUsername,
            { count: 30 },
          );
          memberTweetsReceived = tweets.length;

          const posts = [];
          for (const tweet of tweets) {
            if (tweet.created_at < retentionCutoff) {
              totalSkipped++;
              memberFiltered++;
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
          memberNew = inserted;
          totalNew += inserted;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : String(err);
          memberError = message;
          errors.push(`@${member.twitterUsername}: ${message}`);
        }

        // Emit progress event after each member
        controller.enqueue(
          encoder.encode(
            sseMessage("progress", {
              current: i + 1,
              total: members.length,
              username: member.twitterUsername,
              tweetsReceived: memberTweetsReceived,
              filtered: memberFiltered,
              newPosts: memberNew,
              error: memberError,
            }),
          ),
        );

        // Emit newly inserted posts so the client can render them in real-time
        if (memberNew > 0) {
          const recentPosts = fetchedPostsRepo.findByMemberId(member.id, memberNew);
          const postsData = recentPosts.map((p) => ({
            id: p.id,
            tweetId: p.tweetId,
            twitterUsername: p.twitterUsername,
            text: p.text,
            translatedText: p.translatedText,
            commentText: p.commentText,
            quotedTranslatedText: p.quotedTranslatedText,
            translatedAt: p.translatedAt,
            tweetCreatedAt: p.tweetCreatedAt,
            fetchedAt: p.fetchedAt,
            tweet: JSON.parse(p.tweetJson),
          }));
          controller.enqueue(
            encoder.encode(
              sseMessage("posts", { posts: postsData }),
            ),
          );
        }
      }

      // Persist log entry
      fetchLogsRepo.insert({
        userId: user.id,
        type: "fetch",
        attempted: members.length,
        succeeded: totalNew,
        skipped: totalSkipped,
        purged: purged + purgedOrphans,
        errorCount: errors.length,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
      });

      // Emit final summary
      controller.enqueue(
        encoder.encode(
          sseMessage("done", {
            fetched: members.length,
            newPosts: totalNew,
            skippedOld: totalSkipped,
            purged: purged + purgedOrphans,
            errors,
          }),
        ),
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
