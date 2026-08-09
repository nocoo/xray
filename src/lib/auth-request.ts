import { NextRequest } from "next/server";

/**
 * Convert a plain Request to NextRequest without dropping method/body.
 *
 * Never use `new NextRequest(url, request)` — production Next builds treat the
 * second argument as RequestInit and ignore Request fields, turning POST into
 * GET with an empty body. That breaks Auth.js sign-in (UnknownAction →
 * Configuration → client JSON parse error on HTML).
 */
export function toNextRequest(req: Request): NextRequest {
  if (req instanceof NextRequest) return req;
  return new NextRequest(req);
}

/**
 * Rewrite request origin to AUTH_URL / NEXTAUTH_URL while keeping method & body.
 *
 * next-auth's built-in reqWithEnvURL uses the broken NextRequest(url, req)
 * constructor, so we do the rewrite ourselves before calling Auth().
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
    // Required by Fetch when body is a stream/buffer in some runtimes
    duplex: "half",
  });
}
