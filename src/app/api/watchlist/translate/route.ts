/**
 * POST /api/watchlist/translate
 *
 * Translate fetched posts for the current user.
 * Uses the user's configured AI provider. Each post is translated independently;
 * failures don't block other translations.
 *
 * Body options:
 *   - { postId: number }                  — translate a single post by ID (JSON response)
 *   - { limit?: number, stream?: boolean } — translate up to `limit` untranslated posts
 *     When stream=true, returns SSE with per-post translation progress:
 *       - translated: { postId, translatedText, commentText, quotedTranslatedText?, current, total }
 *       - error:      { postId, error, current, total }
 *       - done:       { translated, errors, remaining }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import * as fetchLogsRepo from "@/db/repositories/fetch-logs";
import { translateBatch, translateText } from "@/services/translation";

export const dynamic = "force-dynamic";

/** Format an SSE message. */
function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let limit = 20;
  let singlePostId: number | null = null;
  let streamMode = false;
  try {
    const body = await request.json();
    if (body.postId && Number.isInteger(body.postId)) {
      singlePostId = body.postId;
    }
    if (body.limit && Number.isInteger(body.limit) && body.limit > 0) {
      limit = Math.min(body.limit, 50);
    }
    if (body.stream === true) {
      streamMode = true;
    }
  } catch {
    // Empty body is fine, use defaults
  }

  // ── Single-post mode (always JSON) ──
  if (singlePostId !== null) {
    const post = fetchedPostsRepo.findById(singlePostId);
    if (!post || post.userId !== user.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const tweet = JSON.parse(post.tweetJson);
    const quotedText = tweet.quoted_tweet?.text as string | undefined;
    const postsToTranslate = [{ id: post.id, text: post.text, quotedText }];

    const result = await translateBatch(user.id, postsToTranslate);
    for (const t of result.translated) {
      fetchedPostsRepo.updateTranslation(t.postId, t.translatedText, t.commentText, t.quotedTranslatedText);
    }
    const remaining = fetchedPostsRepo.countUntranslated(user.id);
    const errorMessages = result.errors.map((e) => e.error);

    fetchLogsRepo.insert({
      userId: user.id,
      type: "translate",
      attempted: 1,
      succeeded: result.translated.length,
      skipped: 0,
      purged: 0,
      errorCount: result.errors.length,
      errors: result.errors.length > 0 ? JSON.stringify(errorMessages) : null,
    });

    if (result.translated.length > 0) {
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
      data: { translated: 0, errors: errorMessages, remaining },
    });
  }

  // ── Batch mode ──
  const untranslated = fetchedPostsRepo.findUntranslated(user.id, limit);
  if (untranslated.length === 0) {
    if (streamMode) {
      // Even in stream mode, return JSON for empty case
      return NextResponse.json({
        success: true,
        data: { translated: 0, errors: [], remaining: 0 },
      });
    }
    return NextResponse.json({
      success: true,
      data: { translated: 0, errors: [], remaining: 0 },
    });
  }

  const postsToTranslate = untranslated.map((p) => {
    const tweet = JSON.parse(p.tweetJson);
    const quotedText = tweet.quoted_tweet?.text as string | undefined;
    return { id: p.id, text: p.text, quotedText };
  });

  // ── Stream mode: SSE per-post progress ──
  if (streamMode) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let translatedCount = 0;
        const errorMessages: string[] = [];
        const total = postsToTranslate.length;

        for (let i = 0; i < total; i++) {
          const post = postsToTranslate[i]!;
          try {
            const result = await translateText(user.id, post.text, post.quotedText);
            fetchedPostsRepo.updateTranslation(
              post.id,
              result.translatedText,
              result.commentText,
              result.quotedTranslatedText,
            );
            translatedCount++;

            controller.enqueue(
              encoder.encode(
                sseMessage("translated", {
                  postId: post.id,
                  translatedText: result.translatedText,
                  commentText: result.commentText,
                  quotedTranslatedText: result.quotedTranslatedText ?? null,
                  current: i + 1,
                  total,
                }),
              ),
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errorMessages.push(message);
            controller.enqueue(
              encoder.encode(
                sseMessage("error", {
                  postId: post.id,
                  error: message,
                  current: i + 1,
                  total,
                }),
              ),
            );
          }
        }

        const remaining = fetchedPostsRepo.countUntranslated(user.id);

        fetchLogsRepo.insert({
          userId: user.id,
          type: "translate",
          attempted: total,
          succeeded: translatedCount,
          skipped: 0,
          purged: 0,
          errorCount: errorMessages.length,
          errors: errorMessages.length > 0 ? JSON.stringify(errorMessages) : null,
        });

        controller.enqueue(
          encoder.encode(
            sseMessage("done", {
              translated: translatedCount,
              errors: errorMessages,
              remaining,
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

  // ── Non-stream batch mode (original behavior) ──
  const result = await translateBatch(user.id, postsToTranslate);
  for (const t of result.translated) {
    fetchedPostsRepo.updateTranslation(t.postId, t.translatedText, t.commentText, t.quotedTranslatedText);
  }
  const remaining = fetchedPostsRepo.countUntranslated(user.id);
  const errorMessages = result.errors.map((e) => e.error);

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

  return NextResponse.json({
    success: true,
    data: {
      translated: result.translated.length,
      errors: errorMessages,
      remaining,
    },
  });
}
