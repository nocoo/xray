import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(req: NextRequest) {
  return withTwitterProvider(req, async (provider) => {
    const lists = await provider.getUserLists();
    return Response.json({ success: true, data: lists });
  });
}
