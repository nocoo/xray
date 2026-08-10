import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";
import { AUTH_BASE_PATH } from "../_handler";

/**
 * Shallow POST entry for Google OAuth.
 *
 * vinext hangs forever on `req.text()` / body streams for
 * `/api/xauth/signin/google` (and the old `/api/auth/signin/google`).
 * Reading the body on this shallower path works; we then rebuild a Request
 * whose pathname Auth.js expects (`…/signin/google`).
 */
function prepareConfig(config: NextAuthConfig): NextAuthConfig {
  const prepared: NextAuthConfig = {
    ...config,
    providers: [...config.providers],
  };
  prepared.secret ??=
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? undefined;
  prepared.basePath = AUTH_BASE_PATH;
  prepared.trustHost = true;
  return prepared;
}

async function handle(req: Request): Promise<Response> {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const envOrigin = envUrl ? new URL(envUrl).origin : null;

  const incoming = new URL(req.url);
  const origin = envOrigin ?? incoming.origin;
  const targetUrl = `${origin}${AUTH_BASE_PATH}/signin/google${incoming.search}`;

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
  }

  const headers = new Headers(req.headers);
  // Ensure Auth.js sees form body
  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/x-www-form-urlencoded");
  }

  const authReq = new Request(targetUrl, {
    method: req.method,
    headers,
    body: body || undefined,
  });

  return Auth(authReq, prepareConfig(authConfig));
}

export const GET = handle;
export const POST = handle;
