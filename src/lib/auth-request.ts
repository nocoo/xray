import { NextRequest } from "next/server";

/**
 * Convert Request → NextRequest without consuming the body stream.
 *
 * Critical vinext/production constraints:
 * 1. `new NextRequest(url, request)` drops method/body (POST→GET).
 * 2. `await req.arrayBuffer()` / `req.text()` on vinext HTTP Requests hangs
 *    forever for some route trees — never pre-buffer the body.
 * 3. Pass `req.body` through with `duplex: "half"` so Auth.js can read it.
 */
export function toNextRequest(req: Request): NextRequest {
  if (req instanceof NextRequest) return req;

  const method = req.method;
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: req.headers,
  };

  if (method !== "GET" && method !== "HEAD" && req.body) {
    init.body = req.body;
    init.duplex = "half";
  }

  return new NextRequest(req.url, init);
}

/**
 * Rewrite origin to AUTH_URL / NEXTAUTH_URL without consuming the body stream.
 */
export function withCanonicalAuthOrigin(req: NextRequest): NextRequest {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!envUrl) return req;

  const envOrigin = new URL(envUrl).origin;
  if (req.nextUrl.origin === envOrigin) return req;

  const url = req.nextUrl.href.replace(req.nextUrl.origin, envOrigin);
  const method = req.method;
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: req.headers,
  };

  if (method !== "GET" && method !== "HEAD" && req.body) {
    init.body = req.body;
    init.duplex = "half";
  }

  return new NextRequest(url, init);
}
