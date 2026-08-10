import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";
import {
  toNextRequest,
  withCanonicalAuthOrigin,
} from "@/lib/auth-request";

/** Avoid /api/auth — vinext hangs on POST body for that prefix. */
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

export async function authHandler(req: Request): Promise<Response> {
  const nextReq = await withCanonicalAuthOrigin(await toNextRequest(req));
  return Auth(nextReq, prepareConfig(authConfig));
}
