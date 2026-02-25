import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return withTwitterProvider(req, async (provider) => {
    const { conversationId } = await params;
    const conversation = await provider.getConversation(conversationId);
    return Response.json({ success: true, data: conversation });
  });
}
