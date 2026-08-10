import { Auth, skipCSRFCheck } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import { authConfig } from "@/auth";
import { AUTH_BASE_PATH } from "../_handler";

/**
 * Start Google OAuth via GET.
 *
 * Production vinext hangs when route handlers read POST bodies (req.text /
 * arrayBuffer / Auth.js getBody). All dashboard APIs mask this by returning
 * 401 from requireAuth() before reading the body. Auth sign-in cannot.
 *
 * Fix: browser does GET (no body). We synthesize an internal POST Request with
 * a real string body and skipCSRFCheck — same pattern as next-auth server
 * signIn() — then return Auth.js's redirect + Set-Cookie response.
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

export async function GET(req: Request): Promise<Response> {
  const envUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const origin = envUrl
    ? new URL(envUrl).origin
    : new URL(req.url).origin;

  const callbackUrl =
    new URL(req.url).searchParams.get("callbackUrl") ?? "/";

  const signInUrl = `${origin}${AUTH_BASE_PATH}/signin/google`;

  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
  });
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  for (const name of [
    "host",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-for",
  ] as const) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const authReq = new Request(signInUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams({ callbackUrl }),
  });

  return Auth(authReq, {
    ...prepareConfig(authConfig),
    skipCSRFCheck,
  });
}

/** POST kept for diagnostics — prefer GET. */
export async function POST(req: Request): Promise<Response> {
  return GET(req);
}
