import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/tags
 * List all tags for the current user.
 */
export async function GET() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const userTags = db.tags.findAll();

  return NextResponse.json({ success: true, data: userTags });
}

/**
 * POST /api/tags
 * Create a new tag (idempotent — returns existing if name matches).
 * Body: { name: string }
 */
export async function POST(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.name?.trim()) {
    return NextResponse.json(
      { error: "Tag name is required" },
      { status: 400 }
    );
  }

  const tag = db.tags.create({ name: body.name.trim() });

  return NextResponse.json({ success: true, data: tag }, { status: 201 });
}

/**
 * DELETE /api/tags?id=123
 * Delete a tag. Also removes it from all watchlist members.
 */
export async function DELETE(request: Request) {
  const { db, error } = await requireAuth();
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
      { error: "Invalid tag ID" },
      { status: 400 }
    );
  }

  const deleted = db.tags.deleteById(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Tag not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: { deleted: true } });
}
