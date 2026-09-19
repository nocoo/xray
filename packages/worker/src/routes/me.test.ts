import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetAuthorProfileCache } from "../lib/author-profile.js";
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

describe("profile lookup fallbacks", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		resetAuthorProfileCache();
	});
	test("retains authenticated identity when the default fetch returns no profile fields", async () => {
		resetAuthorProfileCache();
		const fetchProfile = vi.fn(async (_url: string, _init?: RequestInit) =>
			Response.json({ name: null, avatar: null }),
		);
		vi.stubGlobal("fetch", fetchProfile);
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("authUser", {
				id: "local-user",
				email: "fixture@example.invalid",
				name: "Local Name",
				image: "https://example.invalid/avatar.png",
				accessIss: "fixture-issuer",
				accessSub: "fixture-sub",
			});
			await next();
		});
		app.get("/api/me", meRoute);
		const response = await app.request("/api/me", {}, {
			ENVIRONMENT: "development",
		} as AppEnv["Bindings"]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			authenticated: true,
			user: {
				id: "local-user",
				email: "fixture@example.invalid",
				name: "Local Name",
				image: "https://example.invalid/avatar.png",
			},
		});
		expect(fetchProfile).toHaveBeenCalledOnce();
		expect(fetchProfile.mock.calls[0]?.[0]).not.toContain("fixture@example.invalid");
	});
});
