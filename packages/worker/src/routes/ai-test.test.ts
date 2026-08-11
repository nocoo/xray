import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { AppEnv, AuthUser } from "../types.js";
import { testAiConfigRoute } from "./ai.js";

const user: AuthUser = {
	id: "u1",
	email: "a@b.c",
	name: null,
	image: null,
	accessIss: null,
	accessSub: null,
};

describe("testAiConfigRoute", () => {
	test("401 without user", async () => {
		const app = new Hono<AppEnv>();
		app.post("/t", testAiConfigRoute);
		const res = await app.request("http://localhost/t", { method: "POST" });
		expect(res.status).toBe(401);
	});

	test("400 when not configured", async () => {
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("authUser", user);
			c.env = {
				DB: {
					prepare() {
						return {
							bind() {
								return {
									async first() {
										return null;
									},
								};
							},
						};
					},
				},
			} as unknown as AppEnv["Bindings"];
			await next();
		});
		app.post("/t", testAiConfigRoute);
		const res = await app.request("http://localhost/t", { method: "POST" });
		expect(res.status).toBe(400);
	});
});
