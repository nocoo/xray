/**
 * POST /api/watchlists/[id]/translate
 *
 * Translate fetched posts for a specific watchlist.
 * Uses the user's configured AI provider.
 *
 * Body options:
 *   - { postId: number }                  — translate a single post by ID (JSON response)
 *   - { limit?: number, stream?: boolean } — translate up to `limit` untranslated posts
 *     When stream=true, returns SSE with per-post translation progress.
 */

import { NextResponse } from "next/server";
import { requireAuthWithWatchlist } from "@/lib/api-helpers";
import * as fetchedPostsRepo from "@/db/repositories/fetched-posts";
import * as fetchLogsRepo from "@/db/repositories/fetch-logs";
import { translateBatch, translateText } from "@/services/translation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Format an SSE message. */
function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request, ctx: RouteContext) {
  const { user, error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
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
    if (!post || post.userId !== user.id || post.watchlistId !== watchlistId) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    let tweet;
    try {
      tweet = JSON.parse(post.tweetJson);
    } catch {
      tweet = {};
    }
    const quotedText = tweet.quoted_tweet?.text as string | undefined;
    const postsToTranslate = [{ id: post.id, text: post.text, quotedText }];

    const result = await translateBatch(user.id, postsToTranslate);
    for (const t of result.translated) {
      fetchedPostsRepo.updateTranslation(t.postId, t.translatedText, t.commentText, t.quotedTranslatedText);
    }
    const remaining = fetchedPostsRepo.countUntranslated(watchlistId);
    const errorMessages = result.errors.map((e) => e.error);

    fetchLogsRepo.insert({
      userId: user.id,
      watchlistId,
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
  const untranslated = fetchedPostsRepo.findUntranslated(watchlistId, limit);
  if (untranslated.length === 0) {
    if (streamMode) {
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
    let tweet;
    try {
      tweet = JSON.parse(p.tweetJson);
    } catch {
      tweet = {};
    }
    const quotedText = tweet.quoted_tweet?.text as string | undefined;
    return { id: p.id, text: p.text, quotedText };
  });

  // ── Stream mode: SSE per-post progress ──
  if (streamMode) {
    const encoder = new TextEncoder();
    let aborted = false;

    const stream = new ReadableStream({
      async start(controller) {
        let translatedCount = 0;
        const errorMessages: string[] = [];
        const total = postsToTranslate.length;

        for (let i = 0; i < total; i++) {
          if (aborted) break;

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

            if (!aborted) {
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
            }
          } catch (err) {
            if (aborted) break;
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

        const remaining = fetchedPostsRepo.countUntranslated(watchlistId);

        fetchLogsRepo.insert({
          userId: user.id,
          watchlistId,
          type: "translate",
          attempted: total,
          succeeded: translatedCount,
          skipped: 0,
          purged: 0,
          errorCount: errorMessages.length,
          errors: errorMessages.length > 0 ? JSON.stringify(errorMessages) : null,
        });

        if (!aborted) {
          controller.enqueue(
            encoder.encode(
              sseMessage("done", {
                translated: translatedCount,
                errors: errorMessages,
                remaining,
              }),
            ),
          );
        }

        controller.close();
      },
      cancel() {
        // Called when the client disconnects — stops the translate loop early
        aborted = true;
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
  const remaining = fetchedPostsRepo.countUntranslated(watchlistId);
  const errorMessages = result.errors.map((e) => e.error);

  fetchLogsRepo.insert({
    userId: user.id,
    watchlistId,
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
