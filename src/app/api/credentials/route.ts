import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as credentialsRepo from "@/db/repositories/credentials";

export const dynamic = "force-dynamic";

/**
 * GET /api/credentials
 * Returns the current user's API credentials (masked).
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const creds = credentialsRepo.findByUserId(user.id);

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
  const { user, error } = await requireAuth();
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

  // Merge with existing values (don't wipe fields not being updated)
  const existing = credentialsRepo.findByUserId(user.id);
  const tweapiKey = body.tweapiKey ?? existing?.tweapiKey ?? null;
  const twitterCookie = body.twitterCookie ?? existing?.twitterCookie ?? null;

  const result = credentialsRepo.upsert(user.id, { tweapiKey, twitterCookie });

  return NextResponse.json({
    configured: true,
    tweapiKey: result.tweapiKey ? maskSecret(result.tweapiKey) : null,
    twitterCookie: result.twitterCookie ? maskSecret(result.twitterCookie) : null,
    updatedAt: result.updatedAt,
  });
}

/**
 * DELETE /api/credentials
 * Remove the current user's API credentials.
 */
export async function DELETE() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const deleted = credentialsRepo.deleteByUserId(user.id);

  if (!deleted) {
    return NextResponse.json({ error: "No credentials found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}

// =============================================================================
// Helpers
// =============================================================================

/** Mask a secret string, showing only the first 4 and last 4 characters. */
function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}
