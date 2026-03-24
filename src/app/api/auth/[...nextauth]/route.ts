import { handlers } from "@/auth";
import { NextRequest } from "next/server";

// Wrap handlers to ensure request is a NextRequest instance.
// vinext may pass a standard Request object to route handlers,
// but next-auth expects NextRequest (with nextUrl property).
// We clone the request first because the proxy layer's auth() middleware
// may have already consumed the body ReadableStream — without cloning,
// @auth/core's getBody() hits "ReadableStream is locked" on the POST
// handlers for sign-in and sign-out.
function wrapHandler(handler: (req: NextRequest) => Promise<Response>) {
  return (req: Request) => {
    const fresh = req.clone();
    const nextReq =
      fresh instanceof NextRequest
        ? fresh
        : new NextRequest(fresh.url, fresh);
    return handler(nextReq);
  };
}

export const GET = wrapHandler(handlers.GET);
export const POST = wrapHandler(handlers.POST);
