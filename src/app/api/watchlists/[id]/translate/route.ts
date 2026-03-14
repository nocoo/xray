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
import { requireAuthWithWatchlist, sseMessage } from "@/lib/api-helpers";
import { translateBatch, translateText } from "@/services/translation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteContext) {
  const { db, error, watchlistId } = await requireAuthWithWatchlist(ctx.params);
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
    const post = db.posts.findById(singlePostId);
    if (!post || post.watchlistId !== watchlistId) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    // Clear any previous error so this acts as a retry
    if (post.translationError) {
      db.posts.clearTranslationError(singlePostId);
    }
    let tweet;
    try {
      tweet = JSON.parse(post.tweetJson);
    } catch {
      tweet = {};
    }
    const quotedText = tweet.quoted_tweet?.text as string | undefined;
    const postsToTranslate = [{ id: post.id, text: post.text, quotedText }];

    const result = await translateBatch(db.userId, postsToTranslate);
    for (const t of result.translated) {
      db.posts.updateTranslation(t.postId, t.translatedText, t.commentText, t.quotedTranslatedText);
    }
    for (const e of result.errors) {
      db.posts.updateTranslationError(e.postId, e.error);
    }
    const remaining = db.posts.countUntranslated(watchlistId);
    const errorMessages = result.errors.map((e) => e.error);

    db.logs.insert({
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
      const translated = result.translated[0];
      if (translated) {
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
    }
    return NextResponse.json({
      success: true,
      data: { translated: 0, errors: errorMessages, remaining },
    });
  }

  // ── Batch mode ──
  const untranslated = db.posts.findUntranslated(watchlistId, limit);
  if (untranslated.length === 0) {
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

  // ── Stream mode: SSE with sliding-window concurrency ──
  // Instead of fixed batches (wait for all 3 → emit → next 3), this uses a
  // sliding window: as soon as one slot finishes, the next post starts
  // immediately. Each post emits a "translating" event on start and a
  // "translated"/"error" event on completion, giving the client real-time
  // per-slot visibility into what's happening.
  if (streamMode) {
    // Re-bind after the early-return guard so TS narrows inside closures
    const scopedDb = db;
    const encoder = new TextEncoder();
    let aborted = false;
    const CONCURRENCY = 3;

    const stream = new ReadableStream({
      async start(controller) {
        let translatedCount = 0;
        let completedCount = 0;
        const errorMessages: string[] = [];
        const total = postsToTranslate.length;

        // Emit total count immediately so the client can show "Translating 0/N"
        controller.enqueue(encoder.encode(sseMessage("start", { total })));

        // Sliding-window concurrency: maintain up to CONCURRENCY in-flight
        let nextIdx = 0;

        function emit(event: string, data: unknown) {
          if (!aborted) controller.enqueue(encoder.encode(sseMessage(event, data)));
        }

        /** Truncate to ~60 chars for a status-bar preview. */
        function preview(text: string): string {
          const oneLine = text.replace(/\n/g, " ").trim();
          return oneLine.length > 60 ? oneLine.slice(0, 57) + "..." : oneLine;
        }

        async function processPost(post: typeof postsToTranslate[0]): Promise<void> {
          // Notify client this post is now in-flight
          emit("translating", { postId: post.id, preview: preview(post.text) });

          try {
            if (aborted) return;
            const result = await translateText(scopedDb.userId, post.text, post.quotedText);
            scopedDb.posts.updateTranslation(
              post.id,
              result.translatedText,
              result.commentText,
              result.quotedTranslatedText,
            );
            translatedCount++;
            completedCount++;
            emit("translated", {
              postId: post.id,
              translatedText: result.translatedText,
              commentText: result.commentText,
              quotedTranslatedText: result.quotedTranslatedText ?? null,
              current: completedCount,
              total,
            });
          } catch (err) {
            completedCount++;
            const message = err instanceof Error ? err.message : String(err);
            errorMessages.push(message);
            scopedDb.posts.updateTranslationError(post.id, message);
            emit("error", {
              postId: post.id,
              error: message,
              current: completedCount,
              total,
            });
          }
        }

        // Launch initial slots
        await new Promise<void>((resolve) => {
          let active = 0;

          function launch() {
            while (active < CONCURRENCY && nextIdx < total && !aborted) {
              const post = postsToTranslate[nextIdx++];
              if (!post) break;
              active++;
              processPost(post).finally(() => {
                active--;
                if (nextIdx < total && !aborted) {
                  launch(); // fill the freed slot immediately
                }
                if (active === 0) resolve(); // all done
              });
            }
            if (active === 0) resolve(); // nothing to do
          }

          launch();
        });

        const remaining = scopedDb.posts.countUntranslated(watchlistId);
        const failed = scopedDb.posts.countFailed(watchlistId);

        scopedDb.logs.insert({
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
          emit("done", {
            translated: translatedCount,
            errors: errorMessages,
            remaining,
            failed,
          });
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
  const result = await translateBatch(db.userId, postsToTranslate);
  for (const t of result.translated) {
    db.posts.updateTranslation(t.postId, t.translatedText, t.commentText, t.quotedTranslatedText);
  }
  for (const e of result.errors) {
    db.posts.updateTranslationError(e.postId, e.error);
  }
  const remaining = db.posts.countUntranslated(watchlistId);
  const errorMessages = result.errors.map((e) => e.error);

  db.logs.insert({
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
