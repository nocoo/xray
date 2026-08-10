import { Auth, skipCSRFCheck } from "@auth/core";
import {
  AUTH_BASE_PATH,
  prepareAuthConfig,
} from "../_handler";

/**
 * Start Google OAuth via GET.
 *
 * Production vinext hangs when handlers read POST bodies. Dashboard APIs hide
 * this by returning 401 from requireAuth() before body parse. Auth sign-in
 * cannot. Browser navigates here with GET; we build an internal POST Request
 * (string body + skipCSRFCheck) like next-auth server signIn().
 */
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
    ...prepareAuthConfig(),
    skipCSRFCheck,
  });
}
