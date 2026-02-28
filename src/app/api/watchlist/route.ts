import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import * as watchlistRepo from "@/db/repositories/watchlist";

export const dynamic = "force-dynamic";

/**
 * GET /api/watchlist
 * List all watchlist members for the current user (with tags).
 */
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const members = watchlistRepo.findByUserId(user.id);

  return NextResponse.json({ success: true, data: members });
}

/**
 * POST /api/watchlist
 * Add a new member to the watchlist.
 * Body: { twitterUsername: string, note?: string, tagIds?: number[] }
 */
export async function POST(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { twitterUsername?: string; note?: string; tagIds?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.twitterUsername?.trim()) {
    return NextResponse.json(
      { error: "twitterUsername is required" },
      { status: 400 }
    );
  }

  const username = body.twitterUsername.trim().toLowerCase().replace(/^@/, "");

  // Check for duplicates
  const existing = watchlistRepo.findByUsernameAndUserId(username, user.id);
  if (existing) {
    return NextResponse.json(
      { error: `@${username} is already in your watchlist` },
      { status: 409 }
    );
  }

  const member = watchlistRepo.create({
    userId: user.id,
    twitterUsername: username,
    note: body.note?.trim() || null,
  });

  // Assign tags if provided
  if (body.tagIds?.length) {
    watchlistRepo.setTags(member.id, body.tagIds);
  }

  // Return with tags populated
  const result = watchlistRepo.findByIdAndUserId(member.id, user.id);

  return NextResponse.json({ success: true, data: result }, { status: 201 });
}

/**
 * PUT /api/watchlist
 * Update a watchlist member.
 * Body: { id: number, note?: string, tagIds?: number[] }
 */
export async function PUT(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  let body: { id?: number; note?: string; tagIds?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const member = watchlistRepo.findByIdAndUserId(body.id, user.id);
  if (!member) {
    return NextResponse.json(
      { error: "Watchlist member not found" },
      { status: 404 }
    );
  }

  // Update note if provided (allow explicit null to clear)
  if (body.note !== undefined) {
    watchlistRepo.updateNote(body.id, body.note?.trim() || null);
  }

  // Update tags if provided
  if (body.tagIds !== undefined) {
    watchlistRepo.setTags(body.id, body.tagIds);
  }

  const result = watchlistRepo.findByIdAndUserId(body.id, user.id);

  return NextResponse.json({ success: true, data: result });
}

/**
 * DELETE /api/watchlist?id=123
 * Remove a member from the watchlist.
 */
export async function DELETE(request: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const idStr = searchParams.get("id");

  if (!idStr) {
    return NextResponse.json(
      { error: "Missing 'id' query parameter" },
      { status: 400 }
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json(
      { error: "Invalid ID" },
      { status: 400 }
    );
  }

  // Verify ownership
  const member = watchlistRepo.findByIdAndUserId(id, user.id);
  if (!member) {
    return NextResponse.json(
      { error: "Watchlist member not found" },
      { status: 404 }
    );
  }

  watchlistRepo.deleteById(id);

  return NextResponse.json({ success: true, data: { deleted: true } });
}
