// Build redirect URLs for auth flows without trusting attacker-controlled
// forwarded headers. Order of precedence:
//
//   1. NEXTAUTH_URL — the configured canonical origin always wins. When the
//      deployment knows its public URL, we never need to look at headers.
//   2. x-forwarded-host on the allowlist (TRUSTED_FORWARDED_HOSTS).
//   3. The request's own origin — same-host redirect, never cross-domain.
//
// This blocks CWE-601 (open redirect via Host / X-Forwarded-Host injection)
// while still working behind a legitimate reverse proxy when configured.

export interface ResolveRedirectInput {
  forwardedHost: string | null;
  forwardedProto: string | null;
  requestOrigin: string;
  pathname: string;
  configuredUrl?: string;
  trustedHosts?: string[];
}

export function parseTrustedHosts(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function safeProto(proto: string | null): "http" | "https" {
  return proto === "http" || proto === "https" ? proto : "https";
}

export function resolveRedirectUrl(input: ResolveRedirectInput): string {
  if (input.configuredUrl) {
    return new URL(input.pathname, input.configuredUrl).toString();
  }

  const trusted = input.trustedHosts ?? [];
  if (
    input.forwardedHost &&
    trusted.includes(input.forwardedHost.toLowerCase())
  ) {
    const proto = safeProto(input.forwardedProto);
    return new URL(input.pathname, `${proto}://${input.forwardedHost}`).toString();
  }

  return new URL(input.pathname, input.requestOrigin).toString();
}
