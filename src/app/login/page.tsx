"use client";

import { getCsrfToken } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Github } from "@/components/icons/github";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import LoadingScreen from "@/components/loading-screen";

const AUTH_BASE = "/api/xauth";

function Barcode() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 80 24"
      fill="currentColor"
      className="h-full opacity-50"
    >
      {[0, 4, 7, 10, 14, 17, 19, 23, 26, 29, 32, 36, 39, 42, 45, 48, 52, 55, 58, 61, 64, 67, 70, 74, 77].map(
        (x, i) => (
          <rect
            key={i}
            x={x}
            y={0}
            width={i % 3 === 0 ? 2 : 1}
            height={24}
            rx={0.5}
          />
        ),
      )}
    </svg>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [pending, setPending] = useState(false);

  const handleGoogleLogin = async () => {
    setPending(true);
    try {
      // Use shallow /api/xauth/google — vinext hangs on POST /signin/google body.
      const csrfToken = await getCsrfToken();
      if (!csrfToken) throw new Error("Missing CSRF token");

      const res = await fetch(`${AUTH_BASE}/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken,
          callbackUrl: "/",
          json: "true",
        }),
      });

      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No redirect URL from auth");
    } catch (e) {
      console.error(e);
      setPending(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const year = today.slice(0, 4);

  return (
    <div className="relative flex min-h-screen flex-col bg-background overflow-hidden">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
        <a
          href="https://github.com/nocoo/xray"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Github className="h-[18px] w-[18px]" />
        </a>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-4">
            <img src="/logo-80.png" alt="X-Ray" width={64} height={64} className="rounded-2xl" />
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold tracking-tight font-mono">X-Ray</h1>
              <p className="text-sm text-muted-foreground">
                Sign in with an authorized account to access the dashboard
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error === "AccessDenied"
                ? "Your account is not authorized to access this application."
                : error === "Configuration"
                  ? "Auth configuration error. Please try again later."
                  : `Sign-in error: ${error}`}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={pending}
            className="flex w-full items-center justify-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {pending ? "Redirecting…" : "Continue with Google"}
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Only authorized email addresses can access this application
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 text-[10px] text-muted-foreground/50 font-mono">
        <span>{year}</span>
        <div className="h-4 w-20">
          <Barcode />
        </div>
        <span>{today}</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}
