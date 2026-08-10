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
});
