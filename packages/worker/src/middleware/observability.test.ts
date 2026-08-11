import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import type { AppEnv } from "../types.js";
import { observability } from "./observability.js";

describe("observability", () => {
	test("sets x-request-id from valid header and logs", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const app = new Hono<AppEnv>();
		app.use("*", observability);
		app.get("/api/live", (c) => c.json({ ok: true }));
		const id = "123e4567-e89b-12d3-a456-426614174000";
		const res = await app.request("/api/live", { headers: { "x-request-id": id } });
		expect(res.status).toBe(200);
		expect(res.headers.get("x-request-id")).toBe(id);
		const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
			request_id: string;
			path: string;
			status: number;
			level: string;
		};
		expect(payload.request_id).toBe(id);
		expect(payload.path).toBe("/api/live");
		expect(payload.status).toBe(200);
		expect(payload.level).toBe("info");
		log.mockRestore();
	});

	test("generates request id when header missing or invalid", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const app = new Hono<AppEnv>();
		app.use("*", observability);
		app.get("/x", (c) => c.text("ok"));
		const res = await app.request("/x", { headers: { "x-request-id": "not-uuid" } });
		expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/i);
		log.mockRestore();
	});

	test("includes user_hash and ingest flag on 5xx", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("authUser", {
				id: "user-abc",
				email: "a@b.c",
				name: null,
				image: null,
				accessIss: null,
				accessSub: null,
			});
			return next();
		});
		app.use("*", observability);
		app.post("/api/v1/ingest/push", (c) => c.json({ ok: true }, 500));
		await app.request("/api/v1/ingest/push", { method: "POST" });
		const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
			user_hash?: string;
			ingest?: { route: string };
			level: string;
			status: number;
		};
		expect(payload.user_hash).toMatch(/^[0-9a-f]{8}$/);
		expect(payload.ingest).toEqual({ route: "push" });
		expect(payload.level).toBe("error");
		expect(payload.status).toBe(500);
		log.mockRestore();
	});

	test("logs error_code when next throws", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		// Call middleware directly to exercise catch path without Hono error wrapper.
		const c = {
			req: {
				header: (n: string) => (n === "x-request-id" ? undefined : undefined),
				path: "/api/x",
				method: "GET",
			},
			header: vi.fn(),
			res: { status: 500 },
			get: () => undefined,
		} as unknown as Parameters<typeof observability>[0];
		await expect(
			observability(c, async () => {
				throw new Error("fail");
			}),
		).rejects.toThrow("fail");
		const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as { error_code?: string };
		expect(payload.error_code).toBe("Error");
		await expect(
			observability(c, async () => {
				throw "x";
			}),
		).rejects.toBe("x");
		const payload2 = JSON.parse(String(log.mock.calls[1]?.[0])) as { error_code?: string };
		expect(payload2.error_code).toBe("Error");
		log.mockRestore();
	});
});
