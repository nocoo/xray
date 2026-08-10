import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";

export const AUTH_BASE_PATH = "/api/xauth";

export function prepareAuthConfig(config: NextAuthConfig = authConfig): NextAuthConfig {
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

/**
 * Rewrite request URL origin to NEXTAUTH_URL (https) without touching the body.
 * Safe for GET (callback, csrf, session). Never buffer POST bodies under vinext.
 */
export function withHttpsOrigin(req: Request): Request {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!envUrl) return req;

  const envOrigin = new URL(envUrl).origin;
  const current = new URL(req.url);
  if (current.origin === envOrigin) return req;

  // GET/HEAD only — no body to copy
  if (req.method !== "GET" && req.method !== "HEAD") return req;

  return new Request(req.url.replace(current.origin, envOrigin), {
    method: req.method,
    headers: req.headers,
  });
}

export async function authHandler(req: Request): Promise<Response> {
  return Auth(withHttpsOrigin(req), prepareAuthConfig());
}
