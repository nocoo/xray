// =============================================================================
// GET /api/explore/messages/[conversationId]
// Session-authenticated — get conversation messages.
// =============================================================================

import { NextRequest } from "next/server";
import { withSessionProvider } from "@/lib/twitter/session-handler";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  if (!conversationId) {
    return Response.json(
      { success: false, error: "Missing conversationId" },
      { status: 400 },
    );
  }

  return withSessionProvider(async (provider) => {
    const conversation = await provider.getConversation(conversationId);
    return Response.json({ success: true, data: conversation });
  });
}
