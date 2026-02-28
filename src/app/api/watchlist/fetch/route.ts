/**
 * POST /api/watchlist/fetch
 *
 * Trigger a fetch for all watchlist members of the current user.
 * Fetches tweets via the user's TweAPI credentials, deduplicates against
 * existing fetched_posts, and stores new ones.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as watchlistRepo from "@/db/repositories/watchlist";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import { createProviderForUser } from "@/lib/twitter/provider-factory";

export const dynamic = "force-dynamic";

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
      data: { fetched: 0, newPosts: 0, errors: [] },
    });
  }

  let totalNew = 0;
  const errors: string[] = [];

  for (const member of members) {
    try {
      const tweets = await provider.fetchUserTweets(member.twitterUsername);

      const posts = tweets.map((tweet) => ({
        userId: user.id,
        memberId: member.id,
        tweetId: tweet.id,
        twitterUsername: member.twitterUsername,
        text: tweet.text,
        tweetJson: JSON.stringify(tweet),
        tweetCreatedAt: tweet.created_at,
      }));

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
      errors,
    },
  });
}
