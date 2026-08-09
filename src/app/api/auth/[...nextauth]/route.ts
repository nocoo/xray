import { handlers } from "@/auth";
import { NextRequest } from "next/server";

/**
 * vinext may pass a plain Request to route handlers; next-auth needs NextRequest
 * (nextUrl). Never use `new NextRequest(url, request)` — in production Next's
 * Request subclass that form drops method/body (POST → GET), which makes
 * Auth.js treat sign-in as a page render and throw UnknownAction → Configuration.
 *
 * `new NextRequest(request)` copies method, headers, and body correctly.
 */
export function toNextRequest(req: Request): NextRequest {
  if (req instanceof NextRequest) return req;
  return new NextRequest(req);
}

function wrapHandler(handler: (req: NextRequest) => Promise<Response>) {
  return (req: Request) => handler(toNextRequest(req));
}

export const GET = wrapHandler(handlers.GET);
export const POST = wrapHandler(handlers.POST);
