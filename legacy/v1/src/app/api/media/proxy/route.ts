import { NextResponse } from "next/server";

// Whitelist of allowed Twitter CDN hostnames to prevent open-proxy abuse
const ALLOWED_HOSTS = new Set([
  "video.twimg.com",
  "pbs.twimg.com",
  "abs.twimg.com",
]);

// Cache duration: 1 hour browser, 1 day CDN (Twitter media URLs are immutable)
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, immutable";

export async function GET(req: Request) {
  // vinext passes plain Request (no nextUrl), so parse searchParams from req.url
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json(
      { error: `Host not allowed: ${parsed.hostname}` },
      { status: 403 },
    );
  }

  // Enforce HTTPS
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTPS urls allowed" }, { status: 400 });
  }

  try {
    // Fetch from Twitter CDN without Referer/Origin so it won't 403
    const upstream = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; XRay/1.0)",
        Accept: "*/*",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status },
      );
    }

    // Stream the response body through
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL,
      "Access-Control-Allow-Origin": "*",
    };

    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Proxy fetch failed: ${message}` }, { status: 502 });
  }
}
