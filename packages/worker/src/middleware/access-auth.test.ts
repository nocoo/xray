import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, test } from "vitest";
import type { AppEnv } from "../types.js";
import { accessAuth, setJwtVerifierForTests } from "./access-auth.js";

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
					if (sql.includes("access_iss = ? AND access_sub = ?")) {
						return rows.find((r) => r.access_iss === binds[0] && r.access_sub === binds[1]) ?? null;
					}
					if (sql.includes("access_sub IS NULL")) {
						return rows.find((r) => r.email === binds[0] && r.access_sub == null) ?? null;
					}
					if (sql.includes("WHERE email = ?")) {
						const r = rows.find((x) => x.email === binds[0]);
						return r ? { id: r.id, access_iss: r.access_iss, access_sub: r.access_sub } : null;
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
					} else if (sql.includes("UPDATE users SET email")) {
						const r = rows.find((x) => x.id === binds[3]);
						if (r) {
							r.email = binds[0];
							r.name = binds[1];
							r.image = binds[2];
						}
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
		AUTH_DEV_BYPASS: "false",
		ALLOWED_EMAILS: "ok@xray.local,dev@xray.local",
		CF_ACCESS_TEAM_DOMAIN: "hexly.cloudflareaccess.com",
		CF_ACCESS_AUD: "aud-1",
		DB: mockDb(),
		...env,
	} as AppEnv["Bindings"];
	app.use("*", async (c, next) => {
		// @ts-expect-error test env
		c.env = full;
		return next();
	});
	app.use("/api/*", accessAuth);
	app.get("/api/live", (c) => c.json({ status: "ok" }));
	app.get("/api/me", (c) =>
		c.json({ authenticated: !!c.get("authUser"), user: c.get("authUser") ?? null }),
	);
	return app;
}

afterEach(() => {
	setJwtVerifierForTests(null);
});

describe("accessAuth host matrix", () => {
	test("live public on browser and ingest", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "true", ENVIRONMENT: "development" });
		for (const host of ["xray.hexly.ai", "xray-ingest.hexly.ai", "localhost"]) {
			const res = await app.request("/api/live", { headers: { host } });
			expect(res.status, host).toBe(200);
		}
	});

	test("ingest rejects /api/me and unknown host rejects all", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "true", ENVIRONMENT: "development" });
		expect(
			(await app.request("/api/me", { headers: { host: "xray-ingest.hexly.ai" } })).status,
		).toBe(404);
		expect(
			(await app.request("/api/live", { headers: { host: "xray.evil.example" } })).status,
		).toBe(404);
	});

	test("dev bypass authenticates on browser host", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "true", ENVIRONMENT: "development" });
		const res = await app.request("/api/me", { headers: { host: "xray.dev.hexly.ai" } });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { email: string } };
		expect(body.user.email).toBe("dev@xray.local");
	});

	test("bypass rejected in production", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "true", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", { headers: { host: "xray.hexly.ai" } });
		expect(res.status).toBe(500);
	});
});

describe("accessAuth JWT path", () => {
	test("valid JWT + allowlist succeeds", async () => {
		setJwtVerifierForTests(async () => ({
			email: "ok@xray.local",
			sub: "sub-ok",
			iss: "https://hexly.cloudflareaccess.com",
			name: "Ok",
		}));
		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "header.payload.sig",
			},
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { email: string; accessSub: string } };
		expect(body.user.email).toBe("ok@xray.local");
	});

	test("missing JWT → 401", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", { headers: { host: "xray.hexly.ai" } });
		expect(res.status).toBe(401);
	});

	test("invalid JWT → 403", async () => {
		setJwtVerifierForTests(async () => {
			throw new Error("bad");
		});
		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "bad.token.value",
			},
		});
		expect(res.status).toBe(403);
	});

	test("email not allowlisted → 403", async () => {
		setJwtVerifierForTests(async () => ({
			email: "nope@xray.local",
			sub: "sub-x",
			iss: "https://hexly.cloudflareaccess.com",
		}));
		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(403);
	});

	test("empty ALLOWED_EMAILS trusts Access JWT email", async () => {
		setJwtVerifierForTests(async () => ({
			email: "ok@xray.local",
			sub: "sub-ok",
			iss: "https://hexly.cloudflareaccess.com",
		}));
		const app = makeApp({
			AUTH_DEV_BYPASS: "false",
			ENVIRONMENT: "production",
			ALLOWED_EMAILS: "",
		});
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(200);
	});

	test("missing Access config → 500", async () => {
		const app = makeApp({
			AUTH_DEV_BYPASS: "false",
			ENVIRONMENT: "production",
			CF_ACCESS_TEAM_DOMAIN: "",
			CF_ACCESS_AUD: "",
		});
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(500);
	});

	test("JWT missing email/sub → 403", async () => {
		setJwtVerifierForTests(async () => ({ sub: "only-sub" }));
		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(403);
	});

	test("uses picture claim for image", async () => {
		setJwtVerifierForTests(async () => ({
			email: "ok@xray.local",
			sub: "sub-pic",
			iss: "https://hexly.cloudflareaccess.com",
			picture: "https://img/x.png",
		}));
		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { image: string } };
		expect(body.user.image).toBe("https://img/x.png");
	});

	test("user bind conflict → 403", async () => {
		const db = mockDb();
		// seed bound user A
		await (
			db as unknown as {
				prepare: (s: string) => { bind: (...a: unknown[]) => { run: () => Promise<unknown> } };
			}
		)
			.prepare("INSERT INTO users")
			.bind("id-a", "iss", "sub-a", "ok@xray.local", "A", null, 1)
			.run();
		setJwtVerifierForTests(async () => ({
			email: "ok@xray.local",
			sub: "sub-other",
			iss: "https://hexly.cloudflareaccess.com",
		}));
		const app = makeApp({
			AUTH_DEV_BYPASS: "false",
			ENVIRONMENT: "production",
			DB: db,
		});
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(403);
	});

	test("defaults iss and name; uses image claim", async () => {
		setJwtVerifierForTests(async () => ({
			email: "ok@xray.local",
			sub: "sub-img",
			image: "https://img/from-image.png",
		}));
		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user: { name: string; image: string; accessIss: string } };
		expect(body.user.name).toBe("ok");
		expect(body.user.image).toBe("https://img/from-image.png");
		expect(body.user.accessIss).toBe("https://hexly.cloudflareaccess.com");
	});

	test("db failure on JWT path → 500", async () => {
		setJwtVerifierForTests(async () => ({
			email: "ok@xray.local",
			sub: "sub-fail",
			iss: "https://hexly.cloudflareaccess.com",
		}));
		const db = {
			prepare() {
				return {
					bind() {
						return this;
					},
					async first() {
						throw new Error("d1 down");
					},
					async run() {
						throw new Error("d1 down");
					},
				};
			},
		} as unknown as D1Database;
		const app = makeApp({
			AUTH_DEV_BYPASS: "false",
			ENVIRONMENT: "production",
			DB: db,
		});
		const res = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": "h.p.s",
			},
		});
		expect(res.status).toBe(500);
	});

	test("dev bypass db failure → 500", async () => {
		const db = {
			prepare() {
				return {
					bind() {
						return this;
					},
					async first() {
						throw new Error("d1 down");
					},
					async run() {
						throw new Error("d1 down");
					},
				};
			},
		} as unknown as D1Database;
		const app = makeApp({
			AUTH_DEV_BYPASS: "true",
			ENVIRONMENT: "development",
			DB: db,
		});
		const res = await app.request("/api/me", { headers: { host: "localhost" } });
		expect(res.status).toBe(500);
	});

	test("ingest non-live allowed path proceeds (push stub)", async () => {
		const app = makeApp({ AUTH_DEV_BYPASS: "true", ENVIRONMENT: "development" });
		app.post("/api/v1/ingest/push", (c) => c.json({ ok: true }));
		const res = await app.request("/api/v1/ingest/push", {
			method: "POST",
			headers: { host: "xray-ingest.hexly.ai" },
		});
		expect(res.status).toBe(200);
	});
});

describe("accessAuth real jose/JWKS path (S23R3-01)", () => {
	const team = "hexly.cloudflareaccess.com";
	const aud = "aud-1";
	const iss = `https://${team}`;
	let fetchOrig: typeof globalThis.fetch | undefined;

	async function mint(
		privateKey: CryptoKey,
		opts: { email?: string; sub: string; issuer: string; audience: string },
	) {
		return new SignJWT({ email: opts.email ?? "ok@xray.local", name: "Ok" })
			.setProtectedHeader({ alg: "RS256", kid: "test-kid" })
			.setSubject(opts.sub)
			.setIssuer(opts.issuer)
			.setAudience(opts.audience)
			.setIssuedAt()
			.setExpirationTime("2h")
			.sign(privateKey);
	}

	afterEach(() => {
		if (fetchOrig) globalThis.fetch = fetchOrig;
		fetchOrig = undefined;
		setJwtVerifierForTests(null);
	});

	test("valid signed JWT via JWKS succeeds; bad sig/iss/aud fail", async () => {
		const pair = await generateKeyPair("RS256");
		const other = await generateKeyPair("RS256");
		const pub = await exportJWK(pair.publicKey);
		pub.kid = "test-kid";
		pub.alg = "RS256";
		pub.use = "sig";

		fetchOrig = globalThis.fetch;
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes(`${team}/cdn-cgi/access/certs`)) {
				return new Response(JSON.stringify({ keys: [pub] }), {
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`unexpected fetch ${url}`);
		}) as typeof fetch;

		// production jose verifier (not injectable fake)
		setJwtVerifierForTests(null);

		const app = makeApp({ AUTH_DEV_BYPASS: "false", ENVIRONMENT: "production" });
		const good = await mint(pair.privateKey, {
			sub: "sub-real",
			issuer: iss,
			audience: aud,
		});
		const ok = await app.request("/api/me", {
			headers: {
				host: "xray.hexly.ai",
				"Cf-Access-Jwt-Assertion": good,
			},
		});
		expect(ok.status).toBe(200);
		const body = (await ok.json()) as { user: { email: string; accessSub: string } };
		expect(body.user.email).toBe("ok@xray.local");
		expect(body.user.accessSub).toBe("sub-real");

		const badSig = await mint(other.privateKey, {
			sub: "sub-bad",
			issuer: iss,
			audience: aud,
		});
		expect(
			(
				await app.request("/api/me", {
					headers: { host: "xray.hexly.ai", "Cf-Access-Jwt-Assertion": badSig },
				})
			).status,
		).toBe(403);

		const badIss = await mint(pair.privateKey, {
			sub: "sub-iss",
			issuer: "https://evil.example",
			audience: aud,
		});
		expect(
			(
				await app.request("/api/me", {
					headers: { host: "xray.hexly.ai", "Cf-Access-Jwt-Assertion": badIss },
				})
			).status,
		).toBe(403);

		const badAud = await mint(pair.privateKey, {
			sub: "sub-aud",
			issuer: iss,
			audience: "wrong-aud",
		});
		expect(
			(
				await app.request("/api/me", {
					headers: { host: "xray.hexly.ai", "Cf-Access-Jwt-Assertion": badAud },
				})
			).status,
		).toBe(403);
	});
});
