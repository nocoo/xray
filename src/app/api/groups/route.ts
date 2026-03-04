import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/groups
 * List all groups for the current user.
 */
export async function GET() {
  const { db, error } = await requireAuth();
  if (error) return error;

  const list = db.groups.findAll();

  // Attach member counts
  const data = list.map((g) => ({
    ...g,
    memberCount: db.groupMembers.countByGroupId(g.id),
  }));

  return NextResponse.json({ success: true, data });
}

/**
 * POST /api/groups
 * Create a new group.
 * Body: { name: string, description?: string, icon?: string }
 */
export async function POST(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: { name?: string; description?: string; icon?: string };
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

  const group = db.groups.create({
    name: body.name.trim(),
    description: body.description?.trim() || undefined,
    icon: body.icon?.trim() || undefined,
  });

  return NextResponse.json(
    { success: true, data: { ...group, memberCount: 0 } },
    { status: 201 },
  );
}

/**
 * PUT /api/groups
 * Update a group.
 * Body: { id: number, name?: string, description?: string, icon?: string }
 */
export async function PUT(request: Request) {
  const { db, error } = await requireAuth();
  if (error) return error;

  let body: {
    id?: number;
    name?: string;
    description?: string;
    icon?: string;
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

  const existing = db.groups.findById(body.id);
  if (!existing) {
    return NextResponse.json(
      { error: "Group not found" },
      { status: 404 },
    );
  }

  const updates: { name?: string; description?: string | null; icon?: string } = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.icon !== undefined) updates.icon = body.icon.trim();

  const updated = db.groups.update(body.id, updates);

  return NextResponse.json({ success: true, data: updated });
}

/**
 * DELETE /api/groups?id=123
 * Delete a group and all its members (CASCADE).
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

  const existing = db.groups.findById(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Group not found" },
      { status: 404 },
    );
  }

  db.groups.deleteById(id);

  return NextResponse.json({ success: true, data: { deleted: true } });
}
