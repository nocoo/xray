import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import {
  toNextRequest,
  withCanonicalAuthOrigin,
} from "@/lib/auth-request";

describe("toNextRequest", () => {
  test("preserves POST method and body from plain Request", async () => {
    const body =
      "csrfToken=abc&callbackUrl=https%3A%2F%2Fxray.hexly.ai%2F&json=true";
    const req = new Request("https://xray.hexly.ai/api/xauth/signin/google", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: "session=1",
      },
      body,
    });

    const nextReq = await toNextRequest(req);

    expect(nextReq).toBeInstanceOf(NextRequest);
    expect(nextReq.method).toBe("POST");
    expect(nextReq.nextUrl.pathname).toBe("/api/xauth/signin/google");
    expect(nextReq.headers.get("cookie")).toBe("session=1");
    expect(await nextReq.text()).toBe(body);
  });

  test("does not coerce POST into GET", async () => {
    const req = new Request("https://xray.hexly.ai/api/xauth/signin/google", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "csrfToken=x",
    });

    const nextReq = await toNextRequest(req);
    expect(nextReq.method).not.toBe("GET");
    expect(nextReq.method).toBe("POST");
  });

  test("handles GET without body", async () => {
    const req = new Request("https://xray.hexly.ai/api/xauth/csrf");
    const nextReq = await toNextRequest(req);
    expect(nextReq.method).toBe("GET");
    expect(nextReq.nextUrl.pathname).toBe("/api/xauth/csrf");
  });
});

describe("withCanonicalAuthOrigin", () => {
  test("rewrites origin without dropping POST body", async () => {
    const prev = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = "https://xray.hexly.ai";
    try {
      const body = "csrfToken=abc&json=true";
      const req = new NextRequest("http://127.0.0.1:7007/api/xauth/signin/google", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });

      const rewritten = await withCanonicalAuthOrigin(req);

      expect(rewritten.method).toBe("POST");
      expect(rewritten.nextUrl.origin).toBe("https://xray.hexly.ai");
      expect(rewritten.nextUrl.pathname).toBe("/api/xauth/signin/google");
      expect(await rewritten.text()).toBe(body);
    } finally {
      if (prev === undefined) delete process.env.NEXTAUTH_URL;
      else process.env.NEXTAUTH_URL = prev;
    }
  });

  test("no-op when origin already matches", async () => {
    const prev = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = "https://xray.hexly.ai";
    try {
      const req = new NextRequest("https://xray.hexly.ai/api/xauth/csrf");
      const out = await withCanonicalAuthOrigin(req);
      expect(out).toBe(req);
    } finally {
      if (prev === undefined) delete process.env.NEXTAUTH_URL;
      else process.env.NEXTAUTH_URL = prev;
    }
  });
});
