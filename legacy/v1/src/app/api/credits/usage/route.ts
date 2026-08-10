// =============================================================================
// GET /api/credits/usage
// Session-authenticated — get user's TweAPI credits usage records.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSessionProvider(async (provider) => {
    const usage = await provider.getCreditsUsage();
    return Response.json({ success: true, data: usage });
  });
}
