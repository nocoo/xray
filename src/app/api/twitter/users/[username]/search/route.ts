import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return Response.json(
      { success: false, error: "Missing required query parameter: q" },
      { status: 400 },
    );
  }

  return withTwitterProvider(req, async (provider) => {
    const { username } = await params;
    const tweets = await provider.searchUserTweets(username, query);
    return Response.json({ success: true, data: tweets });
  });
}
