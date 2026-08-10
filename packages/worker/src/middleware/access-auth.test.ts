import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";
import type { AppEnv } from "../types.js";
import { accessAuth } from "./access-auth.js";

function mockDb() {
	const rows: Array<Record<string, unknown>> = [];
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first() {
					if (sql.includes("access_iss = ?")) {
						return (
							rows.find(
								(r) => r.access_iss === binds[0] && r.access_sub === binds[1],
							) ?? null
						);
					}
					if (sql.includes("access_sub IS NULL")) {
						return rows.find((r) => r.email === binds[0] && r.access_sub == null) ?? null;
					}
					if (sql.includes("WHERE email = ?")) {
						const r = rows.find((x) => x.email === binds[0]);
						return r ? { id: r.id, access_sub: r.access_sub } : null;
					}
					return null;
				},
				async run() {
					if (sql.includes("INSERT INTO users")) {
						rows.push({
							id: binds[0],
							access_iss: binds[1],
							access_sub: binds[2],
							email: binds[3],
							name: binds[4],
							image: binds[5],
							created_at_ms: binds[6],
						});
					}
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

function makeApp(env: Partial<AppEnv["Bindings"]>) {
	const app = new Hono<AppEnv>();
	const full = {
		ENVIRONMENT: "development",
		AUTH_DEV_BYPASS: "true",
		ALLOWED_EMAILS: "dev@xray.local",
		DB: mockDb(),
		...env,
	} as AppEnv["Bindings"];
	app.use("*", async (c, next) => {
		// @ts-expect-error assign test bindings
		c.env = full;
		return next();
	});
	app.use("/api/*", accessAuth);
	app.get("/api/live", (c) => c.json({ status: "ok" }));
	app.get("/api/me", (c) =>
		c.json({
			authenticated: true,
			user: c.get("authUser") ?? null,
		}),
	);
	return app;
}

describe("accessAuth", () => {
	test("GET /api/live is public without identity", async () => {
		const app = makeApp({});
		const res = await app.request("/api/live");
		expect(res.status).toBe(200);
	});

	test("dev bypass authenticates /api/me", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "true", ENVIRONMENT: "development" });
		const res = await app.request("/api/me", { headers: { host: "localhost:8787" } });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { email: string } };
		expect(body.user.email).toBe("dev@xray.local");
	});

	test("bypass rejected in production", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "true", ENVIRONMENT: "production" });
		const res = await app.request("/api/me");
		expect(res.status).toBe(500);
	});

	test("ingest host rejects browser apis", async () => {
		const app = makeApp({});
		const res = await app.request("/api/me", {
			headers: { host: "xray-ingest.hexly.ai" },
		});
		expect(res.status).toBe(404);
	});
});
