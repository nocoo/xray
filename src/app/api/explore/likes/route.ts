// =============================================================================
// GET /api/explore/likes
// Session-authenticated — get user's liked tweets.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSessionProvider(async (provider) => {
    const tweets = await provider.getUserLikes();
    return Response.json({ success: true, data: tweets });
  });
}
