// =============================================================================
// GET /api/explore/analytics
// Session-authenticated endpoint returning the current user's Twitter analytics
// with time-series data for charting.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSessionProvider(async (provider) => {
    const analytics = await provider.getUserAnalytics();
    return Response.json({ success: true, data: analytics });
  });
}
