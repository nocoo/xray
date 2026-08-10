/**
 * POST /api/translate
 *
 * Generic translation endpoint for any tweet text.
 * Uses the user's configured AI provider to translate to Chinese
 * and generate an editorial comment.
 *
 * Body: { text: string; quotedText?: string }
 * Response: { success: true, data: { translatedText, commentText, quotedTranslatedText? } }
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { translateText } from "@/services/translation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: { text?: string; quotedText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.text || typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "text is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const quotedText =
    body.quotedText && typeof body.quotedText === "string" && body.quotedText.trim().length > 0
      ? body.quotedText
      : undefined;

  try {
    const result = await translateText(db.userId, body.text, quotedText);
    return NextResponse.json({
      success: true,
      data: {
        translatedText: result.translatedText,
        commentText: result.commentText,
        quotedTranslatedText: result.quotedTranslatedText ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Known user-facing errors
    if (message.includes("AI provider and API key must be configured")) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      );
    }

    console.error("[translate] Translation failed:", err);
    return NextResponse.json(
      { success: false, error: "Translation failed" },
      { status: 500 },
    );
  }
}
