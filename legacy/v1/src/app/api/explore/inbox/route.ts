// =============================================================================
// GET /api/explore/inbox
// Session-authenticated — get DM inbox.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSessionProvider(async (provider) => {
    const inbox = await provider.getInbox();
    return Response.json({ success: true, data: inbox });
  });
}
