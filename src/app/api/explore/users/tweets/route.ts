// =============================================================================
// GET /api/explore/users/tweets?username=&count=
// Session-authenticated — get recent tweets for a user.
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
    const countParam = url.searchParams.get("count");
    const count = countParam ? parseInt(countParam, 10) : 20;

    const tweets = await provider.fetchUserTweets(username, {
      count: Math.min(Math.max(count, 1), 100),
    });

    return Response.json({ success: true, data: tweets });
  });
}
