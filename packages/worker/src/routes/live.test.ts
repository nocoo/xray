import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { AppEnv } from "../types.js";
import { liveRoute } from "./live.js";

function mockDb(ok: boolean): D1Database {
	return {
		prepare: () => ({
			first: async () => (ok ? { ok: 1 } : { ok: 0 }),
			bind: () => ({ first: async () => null }),
			all: async () => ({ results: [] }),
			run: async () => ({ success: true }),
		}),
	} as unknown as D1Database;
}

function app(env: AppEnv["Bindings"]) {
	const h = new Hono<AppEnv>();
	h.use("*", async (c, next) => {
		// @ts-expect-error test env inject
		c.env = env;
		await next();
	});
	h.get("/api/live", liveRoute);
	return h;
}

describe("GET /api/live", () => {
	test("ok when d1 and env healthy", async () => {
		const res = await app({
			DB: mockDb(true),
			ENVIRONMENT: "production",
			CF_ACCESS_TEAM_DOMAIN: "hexly.cloudflareaccess.com",
			CF_ACCESS_AUD: "aud",
		}).request("/api/live");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			status: string;
			version: string;
			component: string;
			checks: Array<{ name: string; ok: boolean }>;
		};
		expect(body.status).toBe("ok");
		expect(body.component).toBe("worker");
		expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
		expect(body.checks.find((c) => c.name === "d1")?.ok).toBe(true);
		expect(body.checks.find((c) => c.name === "env")?.ok).toBe(true);
	});

	test("503 when d1 fails", async () => {
		const res = await app({
			DB: mockDb(false),
			ENVIRONMENT: "development",
		}).request("/api/live");
		expect(res.status).toBe(503);
		const body = (await res.json()) as { status: string };
		expect(body.status).not.toBe("ok");
	});

	test("503 when DB binding missing", async () => {
		const res = await app({
			ENVIRONMENT: "development",
		} as AppEnv["Bindings"]).request("/api/live");
		expect(res.status).toBe(503);
	});
});
