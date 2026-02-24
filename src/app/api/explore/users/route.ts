// =============================================================================
// GET /api/explore/users?q=
// Session-authenticated user search (searches in user tweets to find users).
//
// GET /api/explore/users/[username]
// is handled by a separate route file.
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
    const info = await provider.getUserInfo(username);
    return Response.json({ success: true, data: info });
  });
}
