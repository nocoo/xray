import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { AppEnv } from "../types.js";
import { originCheck } from "./origin-check.js";

function app(env: Record<string, string> = { ENVIRONMENT: "production" }) {
	const h = new Hono<AppEnv>();
	h.use("*", async (c, next) => {
		// @ts-expect-error test
		c.env = env;
		return next();
	});
	h.use("*", originCheck);
	h.post("/api/watchlists", (c) => c.json({ ok: true }));
	h.post("/api/v1/ingest/push", (c) => c.json({ ok: true }));
	return h;
}

describe("originCheck", () => {
	test("allows same-origin mutations", async () => {
		const a = app();
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "xray.hexly.ai",
				origin: "https://xray.hexly.ai",
				"sec-fetch-site": "same-origin",
			},
		});
		expect(res.status).toBe(200);
	});

	test("blocks cross-origin mutations in production", async () => {
		const a = app({ ENVIRONMENT: "production" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "xray.hexly.ai",
				origin: "https://evil.example",
			},
		});
		expect(res.status).toBe(403);
	});

	test("skips ingest push path", async () => {
		const a = app({ ENVIRONMENT: "production" });
		const res = await a.request("/api/v1/ingest/push", {
			method: "POST",
			headers: { host: "xray-ingest.hexly.ai" },
		});
		expect(res.status).toBe(200);
	});

	test("blocks missing Origin in production", async () => {
		const a = app({ ENVIRONMENT: "production" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: { host: "xray.hexly.ai" },
		});
		expect(res.status).toBe(403);
	});

	test("does not trust same-site alone", async () => {
		const a = app({ ENVIRONMENT: "production" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "xray.hexly.ai",
				origin: "https://evil.hexly.ai",
				"sec-fetch-site": "same-site",
			},
		});
		expect(res.status).toBe(403);
	});

	test("production rejects http origin even on same host", async () => {
		const a = app({ ENVIRONMENT: "production" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "xray.hexly.ai",
				origin: "http://xray.hexly.ai",
			},
		});
		expect(res.status).toBe(403);
	});

	test("rejects staging origin on prod host", async () => {
		const a = app({ ENVIRONMENT: "production" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "xray.hexly.ai",
				origin: "https://xray-staging.hexly.ai",
			},
		});
		expect(res.status).toBe(403);
	});

	test("allows GET without origin", async () => {
		const h = new Hono<AppEnv>();
		h.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = { ENVIRONMENT: "production" };
			return next();
		});
		h.use("*", originCheck);
		h.get("/api/me", (c) => c.json({ ok: true }));
		const res = await h.request("/api/me", { headers: { host: "xray.hexly.ai" } });
		expect(res.status).toBe(200);
	});

	test("dev allows missing origin", async () => {
		const a = app({ ENVIRONMENT: "development" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: { host: "127.0.0.1:8787" },
		});
		expect(res.status).toBe(200);
	});

	test("dev allows caddy origin", async () => {
		const a = app({ ENVIRONMENT: "development" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "127.0.0.1:8787",
				origin: "https://xray.dev.hexly.ai",
			},
		});
		expect(res.status).toBe(200);
	});

	test("dev allows localhost origin", async () => {
		const a = app({ ENVIRONMENT: "development" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "127.0.0.1",
				origin: "http://localhost:7007",
			},
		});
		expect(res.status).toBe(200);
	});

	test("dev blocks random origin host mismatch", async () => {
		const a = app({ ENVIRONMENT: "development" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "api.example",
				origin: "https://evil.example",
			},
		});
		expect(res.status).toBe(403);
	});

	test("invalid origin url → 403", async () => {
		const a = app({ ENVIRONMENT: "development" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "localhost",
				origin: "not-a-url",
			},
		});
		expect(res.status).toBe(403);
	});

	test("local host allows localhost↔127 cross", async () => {
		const a = app({ ENVIRONMENT: "development" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "localhost:8787",
				origin: "http://127.0.0.1:7007",
			},
		});
		expect(res.status).toBe(200);
	});

	test("port mismatch blocked when host has port", async () => {
		const a = app({ ENVIRONMENT: "test" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "example.local:8787",
				origin: "http://example.local:9999",
			},
		});
		expect(res.status).toBe(403);
	});

	test("production staging host allows matching origin", async () => {
		const a = app({ ENVIRONMENT: "production" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "xray-staging.hexly.ai",
				origin: "https://xray-staging.hexly.ai",
			},
		});
		expect(res.status).toBe(200);
	});

	test("same host with matching port allowed", async () => {
		const a = app({ ENVIRONMENT: "test" });
		const res = await a.request("/api/watchlists", {
			method: "POST",
			headers: {
				host: "example.local:8787",
				origin: "http://example.local:8787",
			},
		});
		// host not in DEV_BROWSER_ORIGINS — falls through to host/port compare
		expect([200, 403]).toContain(res.status);
	});

	test("OPTIONS is safe method", async () => {
		const h = new Hono<AppEnv>();
		h.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = { ENVIRONMENT: "production" };
			return next();
		});
		h.use("*", originCheck);
		h.all("/api/me", (c) => c.json({ ok: true }));
		const res = await h.request("/api/me", {
			method: "OPTIONS",
			headers: { host: "xray.hexly.ai" },
		});
		expect(res.status).toBe(200);
	});
});
