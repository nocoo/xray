// =============================================================================
// GET /api/explore/users/tweets?username=&count=&q=
// Session-authenticated — get recent tweets or search a user's tweets.
// If `q` is provided, searches within the user's tweets.
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
    const query = url.searchParams.get("q");

    // If a search query is provided, use searchUserTweets
    if (query?.trim()) {
      const tweets = await provider.searchUserTweets(username, query.trim());
      return Response.json({ success: true, data: tweets });
    }

    // Otherwise, fetch recent tweets
    const countParam = url.searchParams.get("count");
    const count = countParam ? parseInt(countParam, 10) : 20;

    const tweets = await provider.fetchUserTweets(username, {
      count: Math.min(Math.max(count, 1), 100),
    });

    return Response.json({ success: true, data: tweets });
  });
}
