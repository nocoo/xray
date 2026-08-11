import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { encryptSecret, parseKek } from "../lib/secrets-crypto.js";
import type { AppEnv, AuthUser } from "../types.js";
import { testAiConfigRoute } from "./ai.js";

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
	return {
		prepare(sql: string) {
			return {
				bind(..._binds: unknown[]) {
					return {
						async first<T>() {
							if (sql.includes("ai_configs")) return row as T | null;
							return null;
						},
					};
				},
			};
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
		const res = await app.request("http://localhost/t", { method: "POST" });
		expect(res.status).toBe(401);
	});

	test("400 when not configured", async () => {
		const app = mount(null);
		const res = await app.request("http://localhost/t", { method: "POST" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toMatch(/not configured/i);
	});

	test("ok:true when decrypt + upstream 200", async () => {
		const row = await configuredRow("sk-live-secret");
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("https://llm.example/v1/chat/completions");
			const headers = init?.headers as Record<string, string>;
			expect(headers.authorization).toBe("Bearer sk-live-secret");
			const body = JSON.parse(String(init?.body)) as {
				model: string;
				messages: unknown[];
			};
			expect(body.model).toBe("gpt-4o-mini");
			expect(body.messages.length).toBeGreaterThan(0);
			return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
				status: 200,
			});
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const app = mount(row);
		const res = await app.request("http://localhost/t", { method: "POST" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			success: boolean;
			data: { ok: boolean; status: number; provider: string; model: string | null };
		};
		expect(json.success).toBe(true);
		expect(json.data.ok).toBe(true);
		expect(json.data.status).toBe(200);
		expect(json.data.provider).toBe("openai");
		expect(json.data.model).toBe("gpt-4o-mini");
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	test("ok:false when upstream non-OK", async () => {
		const row = await configuredRow();
		globalThis.fetch = vi.fn(
			async () => new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }),
		) as unknown as typeof fetch;

		const app = mount(row);
		const res = await app.request("http://localhost/t", { method: "POST" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			success: boolean;
			data: { ok: boolean; status: number; error: string };
		};
		expect(json.success).toBe(true);
		expect(json.data.ok).toBe(false);
		expect(json.data.status).toBe(401);
		expect(json.data.error).toMatch(/invalid_api_key/);
	});

	test("ok:false when fetch throws", async () => {
		const row = await configuredRow();
		globalThis.fetch = vi.fn(async () => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		const app = mount(row);
		const res = await app.request("http://localhost/t", { method: "POST" });
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { ok: boolean; error: string } };
		expect(json.data.ok).toBe(false);
		expect(json.data.error).toMatch(/network down/);
	});
});
