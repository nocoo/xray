import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { toNextRequest } from "@/app/api/auth/[...nextauth]/route";

describe("toNextRequest", () => {
  test("preserves POST method and body from plain Request", async () => {
    const body = "csrfToken=abc&callbackUrl=https%3A%2F%2Fxray.hexly.ai%2F&json=true";
    const req = new Request("https://xray.hexly.ai/api/auth/signin/google", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: "session=1",
      },
      body,
    });

    const nextReq = toNextRequest(req);

    expect(nextReq).toBeInstanceOf(NextRequest);
    expect(nextReq.method).toBe("POST");
    expect(nextReq.nextUrl.pathname).toBe("/api/auth/signin/google");
    expect(nextReq.headers.get("cookie")).toBe("session=1");
    expect(await nextReq.text()).toBe(body);
  });

  test("returns the same instance when already NextRequest", () => {
    const req = new NextRequest("https://xray.hexly.ai/api/auth/csrf");
    expect(toNextRequest(req)).toBe(req);
  });

  test("does not coerce POST into GET (regression for Configuration login error)", async () => {
    const req = new Request("https://xray.hexly.ai/api/auth/signin/google", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "csrfToken=x",
    });

    // Broken form used in production: new NextRequest(url, request)
    // may drop method depending on Next build — our helper must not do that.
    const nextReq = toNextRequest(req);
    expect(nextReq.method).not.toBe("GET");
    expect(nextReq.method).toBe("POST");
  });
});
