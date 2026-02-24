import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTwitterProvider(req, async (provider) => {
    const { id } = await params;
    const tweet = await provider.getTweetDetails(id);
    return Response.json({ success: true, data: tweet });
  });
}
