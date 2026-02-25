import { handlers } from "@/auth";
import { NextRequest } from "next/server";

// Wrap handlers to ensure request is a NextRequest instance.
// vinext may pass a standard Request object to route handlers,
// but next-auth expects NextRequest (with nextUrl property).
function wrapHandler(handler: (req: NextRequest) => Promise<Response>) {
  return (req: Request) => {
    const nextReq =
      req instanceof NextRequest ? req : new NextRequest(req.url, req);
    return handler(nextReq);
  };
}

export const GET = wrapHandler(handlers.GET);
export const POST = wrapHandler(handlers.POST);
