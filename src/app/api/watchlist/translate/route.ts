/**
 * POST /api/watchlist/translate
 *
 * Translate fetched posts for the current user.
 * Uses the user's configured AI provider. Each post is translated independently;
 * failures don't block other translations.
 *
 * Body options:
 *   - { postId: number }          — translate a single post by ID
 *   - { limit?: number }          — translate up to `limit` untranslated posts (default 20)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import * as fetchLogsRepo from "@/db/repositories/fetch-logs";
import { translateBatch } from "@/services/translation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let limit = 20;
  let singlePostId: number | null = null;
  try {
    const body = await request.json();
    if (body.postId && Number.isInteger(body.postId)) {
      singlePostId = body.postId;
    }
    if (body.limit && Number.isInteger(body.limit) && body.limit > 0) {
      limit = Math.min(body.limit, 50);
    }
  } catch {
    // Empty body is fine, use defaults
  }

  let postsToTranslate: { id: number; text: string; quotedText?: string }[];

  if (singlePostId !== null) {
    // Single-post mode: translate (or re-translate) a specific post
    const post = fetchedPostsRepo.findById(singlePostId);
    if (!post || post.userId !== user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const tweet = JSON.parse(post.tweetJson);
    const quotedText = tweet.quoted_tweet?.text as string | undefined;
    postsToTranslate = [{ id: post.id, text: post.text, quotedText }];
  } else {
    // Batch mode: translate untranslated posts
    const untranslated = fetchedPostsRepo.findUntranslated(user.id, limit);
    if (untranslated.length === 0) {
      return NextResponse.json({
        success: true,
        data: { translated: 0, errors: [], remaining: 0 },
      });
    }
    postsToTranslate = untranslated.map((p) => {
      const tweet = JSON.parse(p.tweetJson);
      const quotedText = tweet.quoted_tweet?.text as string | undefined;
      return { id: p.id, text: p.text, quotedText };
    });
  }

  const result = await translateBatch(user.id, postsToTranslate);

  // Persist successful translations
  for (const t of result.translated) {
    fetchedPostsRepo.updateTranslation(
      t.postId,
      t.translatedText,
      t.commentText,
      t.quotedTranslatedText,
    );
  }

  const remaining = fetchedPostsRepo.countUntranslated(user.id);

  const errorMessages = result.errors.map((e) => e.error);

  // Persist log entry
  fetchLogsRepo.insert({
    userId: user.id,
    type: "translate",
    attempted: postsToTranslate.length,
    succeeded: result.translated.length,
    skipped: 0,
    purged: 0,
    errorCount: result.errors.length,
    errors: result.errors.length > 0 ? JSON.stringify(errorMessages) : null,
  });

  // For single-post mode, include the updated post data
  if (singlePostId !== null && result.translated.length > 0) {
    const translated = result.translated[0]!;
    return NextResponse.json({
      success: true,
      data: {
        translated: 1,
        errors: errorMessages,
        remaining,
        translatedText: translated.translatedText,
        commentText: translated.commentText,
        quotedTranslatedText: translated.quotedTranslatedText ?? null,
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      translated: result.translated.length,
      errors: errorMessages,
      remaining,
    },
  });
}
