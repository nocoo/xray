// =============================================================================
// GET /api/explore/lists
// Session-authenticated — get user's Twitter lists.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSessionProvider(async (provider) => {
    const lists = await provider.getUserLists();
    return Response.json({ success: true, data: lists });
  });
}
