import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return Response.json(
      { success: false, error: "Missing required query parameter: q" },
      { status: 400 },
    );
  }

  return withTwitterProvider(req, async (provider) => {
    const countParam = url.searchParams.get("count");
    const count = countParam ? parseInt(countParam, 10) : undefined;
    const sortByTop = url.searchParams.get("sort_by_top") === "true";

    const tweets = await provider.searchTweets(query, {
      count: count && count >= 1 && count <= 100 ? count : undefined,
      sort_by_top: sortByTop,
    });

    return Response.json({ success: true, data: tweets });
  });
}
