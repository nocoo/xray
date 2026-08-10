// =============================================================================
// GET /api/credits
// Session-authenticated — get user's TweAPI credits balance.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSessionProvider(async (provider) => {
    const credits = await provider.getCredits();
    return Response.json({ success: true, data: credits });
  });
}
