import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { encryptSecret, parseKek } from "../lib/secrets-crypto.js";
import type { AppEnv, AuthUser } from "../types.js";
import { getAiConfigRoute, putAiConfigRoute, testAiConfigRoute } from "./ai.js";

const KEK = "0123456789abcdef0123456789abcdef";

const user: AuthUser = {
	id: "u1",
	email: "a@b.c",
	name: null,
	image: null,
	accessIss: null,
	accessSub: null,
};

type AiRow = {
	user_id: string;
	provider: string;
	model: string | null;
	base_url: string | null;
	api_key_ciphertext: Uint8Array;
	api_key_key_version: number;
	translation_prompt: string | null;
	summary_prompt: string | null;
	updated_at_ms: number;
};

function dbWithAi(row: AiRow | null): D1Database {
	const store = { row };
	return {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...a: unknown[]) {
					binds.push(...a);
					return stmt;
				},
				async first<T>() {
					if (sql.includes("ai_configs")) return store.row as T | null;
					return null;
				},
				async run() {
					if (sql.includes("INSERT INTO ai_configs") || sql.includes("ai_configs")) {
						// minimal upsert for put route tests
						const existing = store.row;
						store.row = {
							user_id: "u1",
							provider: String(binds[1] ?? existing?.provider ?? "openai"),
							model: (binds[2] as string | null) ?? existing?.model ?? null,
							base_url: (binds[3] as string | null) ?? existing?.base_url ?? null,
							api_key_ciphertext:
								(binds[4] as Uint8Array) ?? existing?.api_key_ciphertext ?? new Uint8Array(),
							api_key_key_version: (binds[5] as number) ?? existing?.api_key_key_version ?? 1,
							translation_prompt:
								(binds[6] as string | null) ?? existing?.translation_prompt ?? null,
							summary_prompt: (binds[7] as string | null) ?? existing?.summary_prompt ?? null,
							updated_at_ms: Date.now(),
						};
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
	} as unknown as D1Database;
}

async function configuredRow(apiKey = "sk-unit"): Promise<AiRow> {
	const blob = await encryptSecret(apiKey, parseKek(KEK, 1), "u1:ai.api_key");
	return {
		user_id: "u1",
		provider: "openai",
		model: "gpt-4o-mini",
		base_url: "https://llm.example/v1",
		api_key_ciphertext: blob,
		api_key_key_version: 1,
		translation_prompt: null,
		summary_prompt: null,
		updated_at_ms: Date.now(),
	};
}

function mount(row: AiRow | null) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("authUser", user);
		c.env = {
			DB: dbWithAi(row),
			XRAY_SECRETS_KEK: KEK,
			XRAY_SECRETS_KEY_VERSION: "1",
		} as AppEnv["Bindings"];
		await next();
	});
	app.get("/cfg", getAiConfigRoute);
	app.put("/cfg", putAiConfigRoute);
	app.post("/t", testAiConfigRoute);
	return app;
}

const origFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = origFetch;
	vi.restoreAllMocks();
});

describe("testAiConfigRoute", () => {
	test("401 without user", async () => {
		const app = new Hono<AppEnv>();
		app.post("/t", testAiConfigRoute);
		const res = await app.request("http://localhost/t", { method: "POST", body: "{}" });
		expect(res.status).toBe(401);
	});

	test("400 when not configured", async () => {
		const app = mount(null);
		const res = await app.request("http://localhost/t", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/not configured|API key/i);
	});

	test("ok:true when decrypt + upstream JSON content", async () => {
		const row = await configuredRow("sk-live-secret");
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("https://llm.example/v1/chat/completions");
			const headers = init?.headers as Record<string, string>;
			expect(headers.authorization).toBe("Bearer sk-live-secret");
			return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
				status: 200,
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const app = mount(row);
		const res = await app.request("http://localhost/t", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			success: boolean;
			data: { ok: boolean; status: number; provider: string; model: string | null };
		};
		expect(json.success).toBe(true);
		expect(json.data.ok).toBe(true);
		expect(json.data.status).toBe(200);
		expect(json.data.provider).toBe("openai");
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	test("ok:false when upstream non-OK", async () => {
		const row = await configuredRow();
		globalThis.fetch = vi.fn(
			async () => new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }),
		) as unknown as typeof fetch;

		const app = mount(row);
		const res = await app.request("http://localhost/t", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			success: boolean;
			data: { ok: boolean; status: number; error: string };
		};
		expect(json.data.ok).toBe(false);
		expect(json.data.status).toBe(401);
		expect(json.data.error).toMatch(/invalid_api_key/);
	});

	test("ok:false when 2xx HTML / non-JSON", async () => {
		const row = await configuredRow();
		globalThis.fetch = vi.fn(
			async () => new Response("<html>ok</html>", { status: 200 }),
		) as unknown as typeof fetch;
		const app = mount(row);
		const res = await app.request("http://localhost/t", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		const json = (await res.json()) as { data: { ok: boolean; error: string } };
		expect(json.data.ok).toBe(false);
		expect(json.data.error).toMatch(/not JSON/i);
	});

	test("ok:false when baseUrl is http or private", async () => {
		const row = await configuredRow();
		row.base_url = "http://api.openai.com/v1";
		const app = mount(row);
		const res = await app.request("http://localhost/t", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		const json = (await res.json()) as { data: { ok: boolean; error: string } };
		expect(json.data.ok).toBe(false);
		expect(json.data.error).toMatch(/https/i);

		row.base_url = "https://127.0.0.1/v1";
		const res2 = await app.request("http://localhost/t", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		const json2 = (await res2.json()) as { data: { ok: boolean; error: string } };
		expect(json2.data.ok).toBe(false);
		expect(json2.data.error).toMatch(/not allowed/i);
	});

	test("draft body apiKey + provider without saved row", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
					status: 200,
				}),
		) as unknown as typeof fetch;
		const app = mount(null);
		const res = await app.request("http://localhost/t", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				model: "m",
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-draft",
			}),
		});
		const json = (await res.json()) as { data: { ok: boolean; provider: string } };
		expect(json.data.ok).toBe(true);
		expect(json.data.provider).toBe("openai");
	});

	test("get returns configured false when empty", async () => {
		const app = mount(null);
		const res = await app.request("http://localhost/cfg");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { configured?: boolean } };
		expect(body.data.configured).toBe(false);
	});

	test("put requires provider and apiKey on first save", async () => {
		const app = mount(null);
		const bad = await app.request("http://localhost/cfg", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(bad.status).toBe(400);

		const invalidJson = await app.request("http://localhost/cfg", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: "not-json",
		});
		expect(invalidJson.status).toBe(400);

		const ok = await app.request("http://localhost/cfg", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				model: "m",
				baseUrl: "https://api.example.com/v1",
				apiKey: "sk-new",
			}),
		});
		expect(ok.status).toBe(200);
		const body = (await ok.json()) as { data: { provider: string; hasApiKey: boolean } };
		expect(body.data.provider).toBe("openai");
		expect(body.data.hasApiKey).toBe(true);
	});

	test("test accepts empty body when configured", async () => {
		const row = await configuredRow();
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
					status: 200,
				}),
		) as unknown as typeof fetch;
		const app = mount(row);
		// no content-type / empty body → draft {}
		const res = await app.request("http://localhost/t", { method: "POST", body: "" });
		expect(res.status).toBe(200);
	});
});
