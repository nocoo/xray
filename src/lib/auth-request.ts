import { NextRequest } from "next/server";

/**
 * Build a NextRequest that Auth.js can safely consume.
 *
 * Production vinext passes plain Requests whose body streams can deadlock if
 * fed through `new NextRequest(request)` (stream already locked / half-open).
 * Always buffer method/headers/body first, then construct explicitly.
 *
 * Also never use `new NextRequest(url, request)` — production Next treats the
 * second arg as RequestInit and drops method/body (POST → GET).
 */
export async function toNextRequest(req: Request): Promise<NextRequest> {
  const method = req.method;
  const headers = new Headers(req.headers);
  const body =
    method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  return new NextRequest(req.url, {
    method,
    headers,
    body,
  });
}

/**
 * Rewrite request origin to AUTH_URL / NEXTAUTH_URL while keeping method & body.
 *
 * next-auth's built-in reqWithEnvURL uses the broken NextRequest(url, req)
 * constructor, so route handlers call Auth() with this rewrite instead.
 */
export async function withCanonicalAuthOrigin(
  req: NextRequest,
): Promise<NextRequest> {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!envUrl) return req;

  const envOrigin = new URL(envUrl).origin;
  if (req.nextUrl.origin === envOrigin) return req;

  const url = req.nextUrl.href.replace(req.nextUrl.origin, envOrigin);
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.arrayBuffer();

  return new NextRequest(url, {
    method: req.method,
    headers: req.headers,
    body,
  });
}
