import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(req: NextRequest) {
  return withTwitterProvider(req, async (provider) => {
    const inbox = await provider.getInbox();
    return Response.json({ success: true, data: inbox });
  });
}
