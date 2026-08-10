import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  parseTrustedHosts,
  resolveRedirectUrl,
} from "@/lib/redirect-url";
import { isE2EAuthBypass } from "@/lib/e2e-mode";

function buildRedirectUrl(req: NextRequest, pathname: string): URL {
  const target = resolveRedirectUrl({
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    requestOrigin: req.nextUrl.origin,
    pathname,
    configuredUrl: process.env.NEXTAUTH_URL || undefined,
    trustedHosts: parseTrustedHosts(process.env.TRUSTED_FORWARDED_HOSTS),
  });
  return new URL(target);
}

function useSecureCookies(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.NEXTAUTH_URL?.startsWith("https://") === true ||
    process.env.USE_SECURE_COOKIES === "true"
  );
}

/**
 * NextAuth's auth() middleware wrapper calls reqWithEnvURL() which does
 * `new NextRequest(httpsUrl, req)`. Under vinext that drops/ignores the
 * Cookie header, so req.auth is always null after a successful OAuth
 * callback. Read the JWT directly from the original request instead.
 */
async function isAuthenticated(req: NextRequest): Promise<boolean> {
  const secret =
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? undefined;
  if (!secret) return false;

  const token = await getToken({
    req,
    secret,
    secureCookie: useSecureCookies(),
  });
  return !!token;
}

// Next.js 16 proxy convention (replaces middleware.ts)
export async function proxy(request: NextRequest) {
  if (isE2EAuthBypass()) {
    return NextResponse.next();
  }

  const isLoggedIn = await isAuthenticated(request);
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(buildRedirectUrl(request, "/"));
  }

  if (!isLoginPage && !isLoggedIn) {
    return NextResponse.redirect(buildRedirectUrl(request, "/login"));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes.
    // ALL /api/* routes are excluded because:
    // 1. /api/xauth/* — body must reach Auth handlers untouched
    // 2. /api/* (non-auth) — already protected by requireAuth() in each
    //    route handler, so proxy-level auth is redundant
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$|.*\\.svg$|api/).*)",
  ],
};
