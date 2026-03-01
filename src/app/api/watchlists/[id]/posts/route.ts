/**
 * GET /api/watchlists/[id]/posts
 *
 * List fetched posts for a specific watchlist, newest first.
 * Query params:
 *   - memberId: filter by watchlist member (optional)
 *   - limit: max results (default 100, max 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithWatchlist } from "@/lib/api-helpers";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
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
    posts = fetchedPostsRepo.findByMemberId(memberId, watchlistId, limit);
  } else {
    posts = fetchedPostsRepo.findByWatchlistId(watchlistId, limit);
  }

  // Return posts with parsed tweetJson for convenience
  const data = posts.map((p) => ({
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

  const untranslatedCount = fetchedPostsRepo.countUntranslated(watchlistId);

  return NextResponse.json({
    success: true,
    data,
    meta: {
      total: data.length,
      untranslatedCount,
    },
  });
}
