import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { classifyHost, isIngestAllowedPath } from "../lib/hosts.js";
import type { AppEnv } from "../types.js";

describe("host routing matrix (R3-04)", () => {
	test("four locked hosts classify correctly", () => {
		expect(classifyHost("xray.hexly.ai")).toBe("browser");
		expect(classifyHost("xray-staging.hexly.ai")).toBe("browser");
		expect(classifyHost("xray-ingest.hexly.ai")).toBe("ingest");
		expect(classifyHost("xray-ingest-staging.hexly.ai")).toBe("ingest");
		expect(classifyHost("unknown.example")).toBe("unknown");
	});

	test("ingest allowlist paths", () => {
		expect(isIngestAllowedPath("GET", "/api/live")).toBe(true);
		expect(isIngestAllowedPath("GET", "/api/me")).toBe(false);
		expect(isIngestAllowedPath("GET", "/")).toBe(false);
	});

	test("middleware-level host reject via app", async () => {
		const { accessAuth } = await import("../middleware/access-auth.js");
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			// @ts-expect-error test
			c.env = {
				ENVIRONMENT: "development",
				AUTH_DEV_BYPASS: "true",
				ALLOWED_EMAILS: "dev@xray.local",
				DB: {
					prepare: () => ({
						bind: () => ({
							first: async () => null,
							run: async () => ({ meta: { changes: 1 } }),
						}),
					}),
				},
			};
			return next();
		});
		app.use("/api/*", accessAuth);
		app.get("/api/me", (c) => c.json({ ok: true }));
		app.get("/api/live", (c) => c.json({ ok: true }));

		expect(
			(await app.request("/api/me", { headers: { host: "xray-ingest.hexly.ai" } })).status,
		).toBe(404);
		expect(
			(await app.request("/api/live", { headers: { host: "xray-ingest.hexly.ai" } })).status,
		).toBe(200);
	});

	test("browser SPA deep link falls back to index; ingest root stays 404", async () => {
		const app = (await import("../index.js")).default;
		const indexHtml = new Response("<!doctype html><title>xray</title>", {
			status: 200,
			headers: { "content-type": "text/html" },
		});
		const assets = {
			fetch: async (input: RequestInfo | URL) => {
				const url =
					typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
				if (url.includes("/index.html") || url.endsWith("/")) return indexHtml.clone();
				return new Response("missing", { status: 404 });
			},
		};
		const env = {
			ENVIRONMENT: "development",
			AUTH_DEV_BYPASS: "true",
			ALLOWED_EMAILS: "dev@xray.local",
			ASSETS: assets,
			DB: {
				prepare: () => ({
					bind: () => ({
						first: async () => ({
							id: "u1",
							email: "dev@xray.local",
							name: "dev",
							image: null,
							access_sub: "dev-bypass",
							access_iss: "dev-bypass",
							created_at: 0,
							updated_at: 0,
						}),
						run: async () => ({ meta: { changes: 1 } }),
					}),
				}),
			},
		};

		const spa = await app.request(
			"http://xray.hexly.ai/watchlist/1",
			{ headers: { host: "xray.hexly.ai", accept: "text/html" } },
			env,
		);
		expect(spa.status).toBe(200);
		expect(await spa.text()).toContain("xray");

		const ingestRoot = await app.request(
			"http://xray-ingest.hexly.ai/",
			{ headers: { host: "xray-ingest.hexly.ai" } },
			env,
		);
		expect(ingestRoot.status).toBe(404);

		const unknownRoot = await app.request(
			"http://evil.example/",
			{ headers: { host: "evil.example" } },
			env,
		);
		expect(unknownRoot.status).toBe(404);
	});
});
