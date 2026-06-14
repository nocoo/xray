import { describe, test, expect } from "vitest";
import {
  parseTrustedHosts,
  resolveRedirectUrl,
} from "@/lib/redirect-url";

describe("parseTrustedHosts", () => {
  test("returns empty array when env is undefined", () => {
    expect(parseTrustedHosts(undefined)).toEqual([]);
  });

  test("trims, lowercases, and drops blanks", () => {
    expect(
      parseTrustedHosts("  Xray.Example.com , , other.example.com  ")
    ).toEqual(["xray.example.com", "other.example.com"]);
  });
});

describe("resolveRedirectUrl", () => {
  const requestOrigin = "https://xray.example.com";

  // ---------------------------------------------------------------------------
  // Configured canonical URL wins
  // ---------------------------------------------------------------------------

  test("NEXTAUTH_URL takes precedence over forwarded host", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "evil.attacker.com",
      forwardedProto: "https",
      requestOrigin,
      pathname: "/login",
      configuredUrl: "https://xray.example.com",
    });
    expect(url).toBe("https://xray.example.com/login");
  });

  test("NEXTAUTH_URL is used even when forwarded headers are absent", () => {
    const url = resolveRedirectUrl({
      forwardedHost: null,
      forwardedProto: null,
      requestOrigin: "http://internal.local:7007",
      pathname: "/",
      configuredUrl: "https://xray.example.com",
    });
    expect(url).toBe("https://xray.example.com/");
  });

  // ---------------------------------------------------------------------------
  // Untrusted forwarded host is REJECTED — this is the security fix.
  // ---------------------------------------------------------------------------

  test("ignores forwarded host that is not on the allowlist", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "evil.attacker.com",
      forwardedProto: "https",
      requestOrigin,
      pathname: "/login",
      trustedHosts: ["xray.example.com"],
    });
    expect(url).toBe("https://xray.example.com/login");
  });

  test("ignores forwarded host when no allowlist is configured", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "evil.attacker.com",
      forwardedProto: "https",
      requestOrigin,
      pathname: "/login",
    });
    expect(url).toBe("https://xray.example.com/login");
  });

  test("ignores forwarded host with a port suffix when allowlist names only the bare host", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "xray.example.com:8443",
      forwardedProto: "https",
      requestOrigin,
      pathname: "/login",
      trustedHosts: ["xray.example.com"],
    });
    expect(url).toBe("https://xray.example.com/login");
  });

  // ---------------------------------------------------------------------------
  // Trusted forwarded host is HONORED.
  // ---------------------------------------------------------------------------

  test("uses forwarded host when it matches the allowlist (case-insensitive)", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "Xray.Example.com",
      forwardedProto: "https",
      requestOrigin: "http://internal.local:7007",
      pathname: "/",
      trustedHosts: ["xray.example.com"],
    });
    expect(url).toBe("https://xray.example.com/");
  });

  test("forwarded host with valid proto uses that proto", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "xray.example.com",
      forwardedProto: "http",
      requestOrigin: "http://internal.local:7007",
      pathname: "/login",
      trustedHosts: ["xray.example.com"],
    });
    expect(url).toBe("http://xray.example.com/login");
  });

  test("forwarded host defaults proto to https when header missing", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "xray.example.com",
      forwardedProto: null,
      requestOrigin: "http://internal.local:7007",
      pathname: "/login",
      trustedHosts: ["xray.example.com"],
    });
    expect(url).toBe("https://xray.example.com/login");
  });

  test("forwarded host ignores junk proto values to prevent scheme injection", () => {
    const url = resolveRedirectUrl({
      forwardedHost: "xray.example.com",
      forwardedProto: "javascript",
      requestOrigin: "http://internal.local:7007",
      pathname: "/login",
      trustedHosts: ["xray.example.com"],
    });
    expect(url).toBe("https://xray.example.com/login");
  });

  // ---------------------------------------------------------------------------
  // Fallback to the request's own origin.
  // ---------------------------------------------------------------------------

  test("uses request origin when no NEXTAUTH_URL and no forwarded host", () => {
    const url = resolveRedirectUrl({
      forwardedHost: null,
      forwardedProto: null,
      requestOrigin: "http://localhost:7007",
      pathname: "/login",
    });
    expect(url).toBe("http://localhost:7007/login");
  });
});
