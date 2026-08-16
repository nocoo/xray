import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { AppEnv } from "../types.js";
import { meRoute } from "./me.js";

describe("meRoute", () => {
	test("401 when unauthenticated", async () => {
		const app = new Hono<AppEnv>();
		app.get("/api/me", meRoute);
		const res = await app.request("/api/me");
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ authenticated: false, user: null });
	});

	test("200 with user when authUser set", async () => {
		const app = new Hono<AppEnv>();
		app.use("/api/me", async (c, next) => {
			c.set("authUser", {
				id: "u1",
				email: "a@x.com",
				name: "A",
				image: null,
				accessIss: "iss",
				accessSub: "sub",
			});
			return next();
		});
		app.get("/api/me", meRoute);
		const res = await app.request("/api/me");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			authenticated: boolean;
			user: { id: string; email: string };
		};
		expect(body.authenticated).toBe(true);
		expect(body.user).toEqual({
			id: "u1",
			email: "a@x.com",
			name: "A",
			image: null,
		});
	});

	test("overlays firefly name and avatar when lookup hits", async () => {
		const app = new Hono<AppEnv>();
		app.use("/api/me", async (c, next) => {
			// @ts-expect-error test env
			c.env = {
				ENVIRONMENT: "test",
				AUTHOR_PROFILE_FETCH: async () => ({
					status: 200,
					json: async () => ({
						name: "Zheng Li",
						avatar: "https://cdn.example/avatar-80.jpg",
					}),
				}),
			};
			c.set("authUser", {
				id: "u1",
				email: "architie@gmail.com",
				name: null,
				image: null,
				accessIss: "iss",
				accessSub: "sub",
			});
			return next();
		});
		app.get("/api/me", meRoute);
		const res = await app.request("/api/me");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			authenticated: true,
			user: {
				id: "u1",
				email: "architie@gmail.com",
				name: "Zheng Li",
				image: "https://cdn.example/avatar-80.jpg",
			},
		});
	});
});
