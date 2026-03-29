"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Github } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import LoadingScreen from "@/components/loading-screen";

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

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl: "/" });
  };

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const year = today.slice(0, 4);

  return (
    <div className="relative flex min-h-screen flex-col bg-background overflow-hidden">
      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
        <a
          href="https://github.com/nocoo/xray"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Github
            className="h-[18px] w-[18px]"
            aria-hidden="true"
            strokeWidth={1.5}
          />
        </a>
        <ThemeToggle />
      </div>

      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 70% 55% at 50% 50%,",
            "hsl(var(--foreground) / 0.045) 0%,",
            "hsl(var(--foreground) / 0.042) 10%,",
            "hsl(var(--foreground) / 0.036) 20%,",
            "hsl(var(--foreground) / 0.028) 32%,",
            "hsl(var(--foreground) / 0.020) 45%,",
            "hsl(var(--foreground) / 0.012) 58%,",
            "hsl(var(--foreground) / 0.006) 72%,",
            "hsl(var(--foreground) / 0.002) 86%,",
            "transparent 100%)",
          ].join(" "),
        }}
      />

      <div className="flex flex-1 items-center justify-center p-4">
        {/* Login card — vertical terminal aesthetic */}
        <div
          className="relative w-72 aspect-[54/86] overflow-hidden rounded-2xl bg-card flex flex-col ring-1 ring-black/[0.08] dark:ring-white/[0.06]"
          style={{
            boxShadow: [
              "0 1px 2px rgba(0,0,0,0.06)",
              "0 4px 8px rgba(0,0,0,0.04)",
              "0 12px 24px rgba(0,0,0,0.06)",
              "0 24px 48px rgba(0,0,0,0.04)",
              "0 0 0 0.5px rgba(0,0,0,0.02)",
              "0 0 60px rgba(0,0,0,0.03)",
            ].join(", "),
          }}
        >
          {/* Header strip */}
          <div className="bg-primary px-5 py-4">
            <div className="flex items-center justify-between">
              <div
                className="h-4 w-8 rounded-full bg-background/80"
                style={{
                  boxShadow:
                    "inset 0 1.5px 3px rgba(0,0,0,0.35), inset 0 -0.5px 1px rgba(255,255,255,0.1)",
                }}
              />
              <div className="flex items-center gap-2">
                <img
                  src="/logo-24.png"
                  alt="xray"
                  width={16}
                  height={16}
                  className="brightness-0 invert"
                />
                <span className="text-sm font-semibold text-primary-foreground">
                  xray
                </span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-primary-foreground/60">
                MONITOR
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[9px] font-mono text-primary-foreground/40 tracking-wider">
                ID {year}-{today.slice(4)}
              </span>
              <div className="h-6 text-primary-foreground">
                <Barcode />
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col items-center px-6 pt-8 pb-6">
            {/* Logo */}
            <div className="h-24 w-24 overflow-hidden rounded-full bg-secondary dark:bg-[#171717] ring-1 ring-border p-2.5">
              <img
                src="/logo-80.png"
                alt="xray"
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            </div>

            <p className="mt-4 text-base font-semibold text-foreground">
              Access Required
            </p>
            <p className="mt-1 text-xs text-muted-foreground text-center">
              Sign in with an authorized account to access the dashboard
            </p>

            {/* Error message */}
            {error && (
              <div className="mt-4 w-full rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive text-center">
                {error === "AccessDenied"
                  ? "Access denied. Your account is not on the allowlist."
                  : "Authentication failed. Please try again."}
              </div>
            )}

            {/* Divider */}
            <div className="mt-5 h-px w-full bg-border" />

            {/* Google Sign-in button */}
            <button
              onClick={handleGoogleLogin}
              className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl bg-secondary px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                viewBox="0 0 24 24"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>

            {/* Footer note */}
            <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground/60">
              Only authorized email addresses can access this application
            </p>
          </div>

          {/* Footer strip */}
          <div className="flex items-center justify-center border-t border-border bg-secondary/50 py-2.5">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-muted-foreground font-mono">
                Secure Connection
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Site footer */}
      <footer className="py-4 text-center text-xs text-muted-foreground/50">
        xray &copy; {new Date().getFullYear()}
      </footer>
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
