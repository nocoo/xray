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

  let body: {
    usernames?: string[];
    members?: { username: string; twitterId?: string }[];
    twitterUsername?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Batch add (new format with twitterId)
  if (body.members && Array.isArray(body.members)) {
    const inserted = db.groupMembers.batchCreateWithIds(groupId, body.members);
    const total = db.groupMembers.countByGroupId(groupId);
    return NextResponse.json(
      { success: true, data: { inserted, total } },
      { status: 201 },
    );
  }

  // Batch add (legacy format — username-only)
  if (body.usernames && Array.isArray(body.usernames)) {
    const inserted = db.groupMembers.batchCreateWithIds(
      groupId,
      body.usernames.map((u) => ({ username: u })),
    );
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
 * Remove a single member from the group.
 *
 * DELETE /api/groups/[id]/members  (body: { ids: number[] })
 * Batch-remove multiple members from the group.
 */
export async function DELETE(request: Request, ctx: RouteContext) {
  const { db, error, groupId } = await requireAuthWithGroup(ctx.params);
  if (error) return error;

  // --- Batch delete via JSON body ---
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: { ids?: number[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: "ids[] is required and must not be empty" },
        { status: 400 },
      );
    }

    // Verify all members belong to this group
    for (const id of body.ids) {
      const member = db.groupMembers.findById(id);
      if (!member || member.groupId !== groupId) {
        return NextResponse.json(
          { error: `Member ${id} not found in this group` },
          { status: 404 },
        );
      }
    }

    const deleted = db.groupMembers.deleteByIds(body.ids);
    return NextResponse.json({ success: true, data: { deleted } });
  }

  // --- Single delete via query param ---
  const { searchParams } = new URL(request.url);
  const idStr = searchParams.get("id");

  if (!idStr) {
    return NextResponse.json(
      { error: "Missing 'id' query parameter or JSON body with ids[]" },
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
