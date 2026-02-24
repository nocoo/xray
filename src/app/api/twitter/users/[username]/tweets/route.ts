import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  return withTwitterProvider(req, async (provider) => {
    const { username } = await params;
    const url = new URL(req.url);
    const countParam = url.searchParams.get("count");
    const count = countParam ? parseInt(countParam, 10) : undefined;

    const tweets = await provider.fetchUserTweets(username, {
      count: count && count >= 1 && count <= 100 ? count : undefined,
    });

    return Response.json({ success: true, data: tweets });
  });
}
