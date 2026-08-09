import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";
import {
  toNextRequest,
  withCanonicalAuthOrigin,
} from "@/lib/auth-request";

/**
 * next-auth handlers call reqWithEnvURL → `new NextRequest(url, req)`, which
 * drops POST method/body in production. Invoke Auth.js directly with a correctly
 * rewritten request instead.
 */
function prepareConfig(config: NextAuthConfig): NextAuthConfig {
  const prepared: NextAuthConfig = {
    ...config,
    providers: [...config.providers],
  };
  prepared.secret ??=
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? undefined;
  prepared.basePath ??= "/api/auth";
  prepared.trustHost = true;
  return prepared;
}

async function handler(req: Request): Promise<Response> {
  const nextReq = await withCanonicalAuthOrigin(toNextRequest(req));
  return Auth(nextReq, prepareConfig(authConfig));
}

export const GET = handler;
export const POST = handler;
