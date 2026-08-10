import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";

/** Avoid /api/auth — use dedicated prefix. */
export const AUTH_BASE_PATH = "/api/xauth";

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

/**
 * Pass the vinext Request straight into Auth.js.
 * Do not wrap with NextRequest or pre-read the body — both hang under vinext.
 * Canonical https origin comes from NEXTAUTH_URL via a lightweight URL rewrite
 * that reuses the same body stream only when needed.
 */
export async function authHandler(req: Request): Promise<Response> {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  let request = req;

  if (envUrl) {
    const envOrigin = new URL(envUrl).origin;
    const current = new URL(req.url);
    if (current.origin !== envOrigin) {
      const target = req.url.replace(current.origin, envOrigin);
      const init: RequestInit & { duplex?: "half" } = {
        method: req.method,
        headers: req.headers,
      };
      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        init.body = req.body;
        init.duplex = "half";
      }
      request = new Request(target, init);
    }
  }

  return Auth(request, prepareConfig(authConfig));
}
