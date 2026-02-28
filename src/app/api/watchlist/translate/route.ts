/**
 * POST /api/watchlist/translate
 *
 * Translate all untranslated fetched posts for the current user.
 * Uses the user's configured AI provider. Each post is translated independently;
 * failures don't block other translations.
 *
 * Optional body: { limit?: number } — max posts to translate (default 20).
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
  try {
    const body = await request.json();
    if (body.limit && Number.isInteger(body.limit) && body.limit > 0) {
      limit = Math.min(body.limit, 50);
    }
  } catch {
    // Empty body is fine, use defaults
  }

  const untranslated = fetchedPostsRepo.findUntranslated(user.id, limit);
  if (untranslated.length === 0) {
    return NextResponse.json({
      success: true,
      data: { translated: 0, errors: [], remaining: 0 },
    });
  }

  const posts = untranslated.map((p) => ({ id: p.id, text: p.text }));
  const result = await translateBatch(user.id, posts);

  // Persist successful translations
  for (const t of result.translated) {
    fetchedPostsRepo.updateTranslation(t.postId, t.translatedText);
  }

  const remaining = fetchedPostsRepo.countUntranslated(user.id);

  const errorMessages = result.errors.map((e) => e.error);

  // Persist log entry
  fetchLogsRepo.insert({
    userId: user.id,
    type: "translate",
    attempted: untranslated.length,
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
