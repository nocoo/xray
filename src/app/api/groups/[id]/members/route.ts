import { NextResponse } from "next/server";
import { requireAuthWithGroup } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/groups/[id]/members
 * List all members for a group (with profile data).
 */
export async function GET(_request: Request, ctx: RouteContext) {
  const { db, error, groupId } = await requireAuthWithGroup(ctx.params);
  if (error) return error;

  const members = db.groupMembers.findByGroupId(groupId);
  return NextResponse.json({ success: true, data: members });
}

/**
 * POST /api/groups/[id]/members
 * Add members to the group.
 * Body: { usernames: string[] } — batch add (skips duplicates)
 *    OR { twitterUsername: string } — single add
 */
export async function POST(request: Request, ctx: RouteContext) {
  const { db, error, groupId } = await requireAuthWithGroup(ctx.params);
  if (error) return error;

  let body: { usernames?: string[]; twitterUsername?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Batch add
  if (body.usernames && Array.isArray(body.usernames)) {
    const inserted = db.groupMembers.batchCreate(groupId, body.usernames);
    const total = db.groupMembers.countByGroupId(groupId);
    return NextResponse.json(
      { success: true, data: { inserted, total } },
      { status: 201 },
    );
  }

  // Single add
  if (!body.twitterUsername?.trim()) {
    return NextResponse.json(
      { error: "twitterUsername or usernames[] is required" },
      { status: 400 },
    );
  }

  const username = body.twitterUsername.trim().toLowerCase().replace(/^@/, "");

  // Check for duplicates
  const existing = db.groupMembers.findByUsernameAndGroup(username, groupId);
  if (existing) {
    return NextResponse.json(
      { error: `@${username} is already in this group` },
      { status: 409 },
    );
  }

  const member = db.groupMembers.create({
    groupId,
    twitterUsername: username,
  });

  const result = db.groupMembers.findById(member.id);

  return NextResponse.json({ success: true, data: result }, { status: 201 });
}

/**
 * DELETE /api/groups/[id]/members?id=123
 * Remove a member from the group.
 */
export async function DELETE(request: Request, ctx: RouteContext) {
  const { db, error, groupId } = await requireAuthWithGroup(ctx.params);
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

  // Verify the member belongs to this group and user
  const member = db.groupMembers.findById(id);
  if (!member || member.groupId !== groupId) {
    return NextResponse.json(
      { error: "Group member not found" },
      { status: 404 },
    );
  }

  db.groupMembers.deleteById(id);

  return NextResponse.json({ success: true, data: { deleted: true } });
}
