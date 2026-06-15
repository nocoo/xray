import { auth } from "@/auth";
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

// Next.js 16 proxy convention (replaces middleware.ts)
const authHandler = auth((req) => {
  if (isE2EAuthBypass()) {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";

  // Redirect to home if logged in and trying to access login page
  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(buildRedirectUrl(req, "/"));
  }

  // Redirect to login if not logged in and trying to access protected page
  if (!isLoginPage && !isLoggedIn) {
    return NextResponse.redirect(buildRedirectUrl(req, "/login"));
  }

  return NextResponse.next();
});

// Export as named 'proxy' function for Next.js 16
export function proxy(request: NextRequest) {
  return authHandler(request, {} as never);
}

export const config = {
  matcher: [
    // Match all paths except static files and API routes.
    // ALL /api/* routes are excluded because:
    // 1. /api/auth/* — proxy's auth() consumes the request body, causing
    //    MissingCSRF on signout/signin POSTs (body already consumed when
    //    the route handler tries to read it)
    // 2. /api/* (non-auth) — already protected by requireAuth() in each
    //    route handler, so proxy-level auth is redundant
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$|.*\\.svg$|api/).*)",
  ],
};
