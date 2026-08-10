import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { maskSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/credentials
 * Returns the current user's API credentials (masked).
 */
export async function GET() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const creds = db.credentials.find();

  if (!creds) {
    return NextResponse.json({ configured: false, tweapiKey: null, twitterCookie: null });
  }

  return NextResponse.json({
    configured: true,
    tweapiKey: creds.tweapiKey ? maskSecret(creds.tweapiKey) : null,
    twitterCookie: creds.twitterCookie ? maskSecret(creds.twitterCookie) : null,
    updatedAt: creds.updatedAt,
  });
}

/**
 * PUT /api/credentials
 * Create or update the current user's API credentials.
 */
export async function PUT(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: { tweapiKey?: string; twitterCookie?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // At least one credential field must be provided
  if (!body.tweapiKey && !body.twitterCookie) {
    return NextResponse.json(
      { error: "At least one of tweapiKey or twitterCookie must be provided" },
      { status: 400 }
    );
  }

  try {
    // Merge with existing values (don't wipe fields not being updated)
    const existing = db.credentials.find();
    const tweapiKey = body.tweapiKey ?? existing?.tweapiKey ?? null;
    const twitterCookie = body.twitterCookie ?? existing?.twitterCookie ?? null;

    const result = db.credentials.upsert({ tweapiKey, twitterCookie });

    return NextResponse.json({
      configured: true,
      tweapiKey: result.tweapiKey ? maskSecret(result.tweapiKey) : null,
      twitterCookie: result.twitterCookie ? maskSecret(result.twitterCookie) : null,
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    console.error("Failed to save credentials:", err);
    return NextResponse.json(
      { error: "Failed to save credentials" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/credentials
 * Remove the current user's API credentials.
 */
export async function DELETE() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const deleted = db.credentials.delete();

  if (!deleted) {
    return NextResponse.json({ error: "No credentials found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
