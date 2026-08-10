import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { liveRoute } from "./live.js";

describe("GET /api/live", () => {
	test("returns ok status and version", async () => {
		const app = new Hono();
		app.get("/api/live", liveRoute);
		const res = await app.request("/api/live");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			status: string;
			version: string;
			component: string;
		};
		expect(body.status).toBe("ok");
		expect(body.component).toBe("worker");
		expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
	});
});
