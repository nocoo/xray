import { NextRequest } from "next/server";
import { withTwitterProvider } from "@/lib/twitter/route-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  return withTwitterProvider(req, async (provider) => {
    const { username } = await params;
    const users = await provider.getUserAffiliates(username);
    return Response.json({ success: true, data: users });
  });
}
