// =============================================================================
// GET /api/explore/users/affiliates?username=
// Session-authenticated — get user's affiliated accounts.
// =============================================================================

import { NextRequest } from "next/server";
import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const username = url.searchParams.get("username");

  if (!username) {
    return Response.json(
      { success: false, error: "Missing required query parameter: username" },
      { status: 400 },
    );
  }

  return withSessionProvider(async (provider) => {
    const users = await provider.getUserAffiliates(username);
    return Response.json({ success: true, data: users });
  });
}
