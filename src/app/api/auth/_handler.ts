import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";
import {
  toNextRequest,
  withCanonicalAuthOrigin,
} from "@/lib/auth-request";

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

/** Shared Auth.js entry used by explicit /api/auth/* routes (not catch-all). */
export async function authHandler(req: Request): Promise<Response> {
  const nextReq = await withCanonicalAuthOrigin(await toNextRequest(req));
  return Auth(nextReq, prepareConfig(authConfig));
}
