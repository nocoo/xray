// =============================================================================
// GET /api/explore/bookmarks
// Session-authenticated — get user's bookmarked tweets.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSessionProvider(async (provider) => {
    const tweets = await provider.getUserBookmarks();
    return Response.json({ success: true, data: tweets });
  });
}
