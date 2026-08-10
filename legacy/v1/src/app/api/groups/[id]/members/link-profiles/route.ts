import { NextResponse } from "next/server";
import { requireAuthWithGroup } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/groups/[id]/members/link-profiles
 * Backfill twitter_id on members by looking up cached twitter_profiles by username.
 * Called after a profile refresh to link newly-resolved profiles to members.
 */
export async function POST(_request: Request, ctx: RouteContext) {
  const { db, error, groupId } = await requireAuthWithGroup(ctx.params);
  if (error) return error;

  const linked = db.groupMembers.linkProfilesByUsername(groupId);

  return NextResponse.json({ success: true, data: { linked } });
}
