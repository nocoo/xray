// =============================================================================
// GET /api/explore/tweets/[id]
// Session-authenticated tweet detail + replies for the web UI.
// =============================================================================

import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withSessionProvider(async (provider) => {
    const [tweet, replies] = await Promise.all([
      provider.getTweetDetails(id),
      provider.getTweetReplies(id),
    ]);

    return Response.json({
      success: true,
      data: { tweet, replies },
    });
  });
}
