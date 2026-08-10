"use client";

import { SessionProvider } from "next-auth/react";

/** Must match AUTH_BASE_PATH — vinext breaks POST under /api/auth. */
const AUTH_BASE_PATH = "/api/xauth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath={AUTH_BASE_PATH}>{children}</SessionProvider>;
}
