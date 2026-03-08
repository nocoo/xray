/**
 * GET    /api/watchlists/[id]/posts          — List fetched posts
 * DELETE /api/watchlists/[id]/posts?postId=N — Remove a single post
 *
 * GET query params:
 *   - memberId: filter by watchlist member (optional)
 *   - limit: max results (default 100, max 500)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithWatchlist } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { db, error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
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
    posts = db.posts.findByMemberId(memberId, watchlistId, limit);
  } else {
    posts = db.posts.findByWatchlistId(watchlistId, limit);
  }

  // Return posts with parsed tweetJson for convenience
  const data = posts.map((p) => {
    let tweet;
    try {
      tweet = JSON.parse(p.tweetJson);
    } catch {
      tweet = null;
    }
    return {
      id: p.id,
      tweetId: p.tweetId,
      twitterUsername: p.twitterUsername,
      text: p.text,
      translatedText: p.translatedText,
      commentText: p.commentText,
      quotedTranslatedText: p.quotedTranslatedText,
      translationError: p.translationError ?? null,
      translatedAt: p.translatedAt,
      tweetCreatedAt: p.tweetCreatedAt,
      fetchedAt: p.fetchedAt,
      tweet,
    };
  });

  const untranslatedCount = db.posts.countUntranslated(watchlistId);

  return NextResponse.json({
    success: true,
    data,
    meta: {
      total: data.length,
      untranslatedCount,
    },
  });
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { db, error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
  if (error) return error;

  const url = new URL(request.url);
  const postIdStr = url.searchParams.get("postId");
  if (!postIdStr) {
    return NextResponse.json(
      { error: "Missing postId query parameter" },
      { status: 400 },
    );
  }

  const postId = parseInt(postIdStr, 10);
  if (isNaN(postId)) {
    return NextResponse.json(
      { error: "Invalid postId" },
      { status: 400 },
    );
  }

  // Verify the post belongs to this watchlist before deleting
  const post = db.posts.findById(postId);
  if (!post || post.watchlistId !== watchlistId) {
    return NextResponse.json(
      { error: "Post not found" },
      { status: 404 },
    );
  }

  db.posts.deleteById(postId);

  return NextResponse.json({ success: true });
}
