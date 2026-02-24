import { describe, expect, test } from "bun:test";
import {
  ProviderError,
  UpstreamError,
  AuthRequiredError,
  TimeoutError,
} from "@/lib/twitter/errors";

describe("ProviderError hierarchy", () => {
  test("ProviderError has correct defaults", () => {
    const err = new ProviderError("something broke");
    expect(err.message).toBe("something broke");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("ProviderError");
    expect(err).toBeInstanceOf(Error);
  });

  test("ProviderError accepts custom status code", () => {
    const err = new ProviderError("bad request", 400);
    expect(err.statusCode).toBe(400);
  });

  test("ProviderError preserves cause", () => {
    const cause = new Error("root cause");
    const err = new ProviderError("wrapper", 500, cause);
    expect(err.cause).toBe(cause);
  });

  test("UpstreamError maps status code", () => {
    const err = new UpstreamError(502, "upstream failed");
    expect(err.statusCode).toBe(502);
    expect(err.name).toBe("UpstreamError");
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toBeInstanceOf(Error);
  });

  test("AuthRequiredError defaults to 401", () => {
    const err = new AuthRequiredError();
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe("AuthRequiredError");
    expect(err.message).toBe(
      "Authentication cookie is required for this endpoint",
    );
    expect(err).toBeInstanceOf(ProviderError);
  });

  test("AuthRequiredError accepts custom message", () => {
    const err = new AuthRequiredError("custom msg");
    expect(err.message).toBe("custom msg");
    expect(err.statusCode).toBe(401);
  });

  test("TimeoutError includes timeout duration", () => {
    const err = new TimeoutError(5000);
    expect(err.statusCode).toBe(504);
    expect(err.name).toBe("TimeoutError");
    expect(err.message).toContain("5000ms");
    expect(err).toBeInstanceOf(ProviderError);
  });
});
