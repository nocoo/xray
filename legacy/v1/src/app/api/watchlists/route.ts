import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/watchlists
 * List all watchlists for the current user.
 */
export async function GET() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const list = db.watchlists.findAll();

  return NextResponse.json({ success: true, data: list });
}

/**
 * POST /api/watchlists
 * Create a new watchlist.
 * Body: { name: string, description?: string, icon?: string, translateEnabled?: 0|1 }
 */
export async function POST(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: {
    name?: string;
    description?: string;
    icon?: string;
    translateEnabled?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.name?.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  const watchlist = db.watchlists.create({
    name: body.name.trim(),
    description: body.description?.trim() || undefined,
    icon: body.icon?.trim() || undefined,
    translateEnabled: body.translateEnabled,
  });

  return NextResponse.json({ success: true, data: watchlist }, { status: 201 });
}

/**
 * PUT /api/watchlists
 * Update a watchlist.
 * Body: { id: number, name?: string, description?: string, icon?: string, translateEnabled?: 0|1 }
 */
export async function PUT(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: {
    id?: number;
    name?: string;
    description?: string;
    icon?: string;
    translateEnabled?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 },
    );
  }

  // Verify ownership (ScopedDB already filters by userId)
  const existing = db.watchlists.findById(body.id);
  if (!existing) {
    return NextResponse.json(
      { error: "Watchlist not found" },
      { status: 404 },
    );
  }

  const updates: {
    name?: string;
    description?: string | null;
    icon?: string;
    translateEnabled?: number;
  } = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.icon !== undefined) updates.icon = body.icon.trim();
  if (body.translateEnabled !== undefined) updates.translateEnabled = body.translateEnabled;

  const updated = db.watchlists.update(body.id, updates);

  return NextResponse.json({ success: true, data: updated });
}

/**
 * DELETE /api/watchlists?id=123
 * Delete a watchlist and all its members, posts, and logs (CASCADE).
 */
export async function DELETE(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const idStr = searchParams.get("id");

  if (!idStr) {
    return NextResponse.json(
      { error: "Missing 'id' query parameter" },
      { status: 400 },
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json(
      { error: "Invalid ID" },
      { status: 400 },
    );
  }

  // Verify ownership (ScopedDB already filters by userId)
  const existing = db.watchlists.findById(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Watchlist not found" },
      { status: 404 },
    );
  }

  db.watchlists.deleteById(id);

  return NextResponse.json({ success: true, data: { deleted: true } });
}
