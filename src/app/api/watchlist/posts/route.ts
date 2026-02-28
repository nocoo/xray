/**
 * GET /api/watchlist/posts
 *
 * List fetched posts for the current user, newest first.
 * Query params:
 *   - memberId: filter by watchlist member (optional)
 *   - limit: max results (default 100, max 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const url = new URL(request.url);
  const memberIdStr = url.searchParams.get("memberId");
  const limitStr = url.searchParams.get("limit");

  const limit = Math.min(
    Math.max(parseInt(limitStr ?? "100", 10) || 100, 1),
    500,
  );

  let posts;
  if (memberIdStr) {
    const memberId = parseInt(memberIdStr, 10);
    if (isNaN(memberId)) {
      return NextResponse.json(
        { error: "Invalid memberId" },
        { status: 400 },
      );
    }
    posts = fetchedPostsRepo.findByMemberId(memberId, limit);
  } else {
    posts = fetchedPostsRepo.findByUserId(user.id, limit);
  }

  // Return posts with parsed tweetJson for convenience
  const data = posts.map((p) => ({
    id: p.id,
    tweetId: p.tweetId,
    twitterUsername: p.twitterUsername,
    text: p.text,
    translatedText: p.translatedText,
    translatedAt: p.translatedAt,
    tweetCreatedAt: p.tweetCreatedAt,
    fetchedAt: p.fetchedAt,
    tweet: JSON.parse(p.tweetJson),
  }));

  const untranslatedCount = fetchedPostsRepo.countUntranslated(user.id);

  return NextResponse.json({
    success: true,
    data,
    meta: {
      total: data.length,
      untranslatedCount,
    },
  });
}
