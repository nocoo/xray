import { Auth } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";

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
 * Hand the vinext Request to Auth.js unchanged.
 * Any Request reconstruction (NextRequest wrap, body buffer, duplex clone)
 * hangs under vinext when method is POST.
 */
export async function authHandler(req: Request): Promise<Response> {
  return Auth(req, prepareConfig(authConfig));
}
