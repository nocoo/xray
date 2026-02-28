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

  return NextResponse.json({
    success: true,
    data: {
      translated: result.translated.length,
      errors: result.errors.map((e) => e.error),
      remaining,
    },
  });
}
