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
});
