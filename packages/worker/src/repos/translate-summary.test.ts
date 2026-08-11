import { describe, expect, test } from "vitest";
import {
	defaultTranslateFn,
	loadSucceededTranslations,
	markTranslateResult,
	resetStalePending,
	runTranslateBatch,
	selectTranslateCandidates,
	TRANSLATE_MAX,
} from "./translate.js";

describe("defaultTranslateFn summary", () => {
	test("fills summaryText when summaryPrompt set", async () => {
		let calls = 0;
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => {
			calls += 1;
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: calls === 1 ? "译文" : "摘要内容" } }],
				}),
				{ status: 200 },
			);
		}) as typeof fetch;
		try {
			const out = await defaultTranslateFn({
				text: "hello",
				apiKey: "k",
				provider: "openai",
				model: "m",
				baseUrl: "https://api.example/v1",
				translationPrompt: "tr",
				summaryPrompt: "sum",
				signal: new AbortController().signal,
			});
			expect(out.translatedText).toBe("译文");
			expect(out.summaryText).toBe("摘要内容");
			expect(calls).toBe(2);
		} finally {
			globalThis.fetch = orig;
		}
	});

	test("summary null when no summary prompt", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ choices: [{ message: { content: "t" } }] }), {
				status: 200,
			})) as typeof fetch;
		try {
			const out = await defaultTranslateFn({
				text: "hello",
				apiKey: "k",
				provider: "openai",
				model: "m",
				baseUrl: null,
				translationPrompt: null,
				summaryPrompt: null,
				signal: new AbortController().signal,
			});
			expect(out.summaryText).toBeNull();
		} finally {
			globalThis.fetch = orig;
		}
	});

	test("upstream error body read failure still throws", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () =>
			({
				ok: false,
				status: 500,
				text: async () => {
					throw new Error("read fail");
				},
			}) as unknown as Response) as typeof fetch;
		try {
			await expect(
				defaultTranslateFn({
					text: "hello",
					apiKey: "k",
					provider: "openai",
					model: "m",
					baseUrl: "https://api.example/v1",
					translationPrompt: null,
					summaryPrompt: null,
					signal: new AbortController().signal,
				}),
			).rejects.toThrow(/upstream 500/);
		} finally {
			globalThis.fetch = orig;
		}
	});

	test("summary non-2xx fails whole translate", async () => {
		let calls = 0;
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => {
			calls += 1;
			if (calls === 1) {
				return new Response(JSON.stringify({ choices: [{ message: { content: "译" } }] }), {
					status: 200,
				});
			}
			return new Response("nope", { status: 503 });
		}) as typeof fetch;
		try {
			await expect(
				defaultTranslateFn({
					text: "hello",
					apiKey: "k",
					provider: "openai",
					model: "m",
					baseUrl: "https://api.example/v1",
					translationPrompt: "tr",
					summaryPrompt: "sum",
					signal: new AbortController().signal,
				}),
			).rejects.toThrow(/upstream 503/);
		} finally {
			globalThis.fetch = orig;
		}
	});

	test("empty summary fails", async () => {
		let calls = 0;
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => {
			calls += 1;
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: calls === 1 ? "译" : "   " } }],
				}),
				{ status: 200 },
			);
		}) as typeof fetch;
		try {
			await expect(
				defaultTranslateFn({
					text: "hello",
					apiKey: "k",
					provider: "openai",
					model: "m",
					baseUrl: "https://api.example/v1",
					translationPrompt: null,
					summaryPrompt: "sum",
					signal: new AbortController().signal,
				}),
			).rejects.toThrow(/empty model response/);
		} finally {
			globalThis.fetch = orig;
		}
	});
});

describe("runTranslateBatch persists summary_text", () => {
	test("successful item stores non-null summary via markTranslateResult path", async () => {
		const items: Array<Record<string, unknown>> = [
			{
				id: 10,
				user_id: "u1",
				watchlist_id: 1,
				text: "hello world",
				ai_status: "not_requested",
				ai_status_updated_at_ms: 0,
				translated_text: null,
				summary_text: null,
			},
		];
		const db = {
			prepare(sql: string) {
				const binds: unknown[] = [];
				const stmt = {
					bind(...a: unknown[]) {
						binds.push(...a);
						return stmt;
					},
					async all<T>() {
						if (sql.includes("FROM items") && sql.includes("ai_status")) {
							return {
								results: items
									.filter((i) => i.user_id === binds[0] && i.watchlist_id === binds[1])
									.map((i) => ({ id: i.id, text: i.text })) as T[],
							};
						}
						return { results: [] as T[] };
					},
					async run() {
						if (sql.includes("ai_status = 'pending'")) {
							const ids = binds.slice(2) as number[];
							for (const id of ids) {
								const row = items.find((i) => i.id === id);
								if (row) row.ai_status = "pending";
							}
							return { meta: { changes: ids.length } };
						}
						if (sql.includes("succeeded") || sql.includes("summary_text")) {
							const [, translated, summary, userId, id] = binds as [
								number,
								string,
								string | null,
								string,
								number,
							];
							const row = items.find((i) => i.id === id && i.user_id === userId);
							if (row) {
								row.ai_status = "succeeded";
								row.translated_text = translated;
								row.summary_text = summary;
							}
							return { meta: { changes: 1 } };
						}
						if (sql.includes("not_requested") || sql.includes("pending")) {
							return { meta: { changes: 0 } };
						}
						return { meta: { changes: 0 } };
					},
				};
				return stmt;
			},
		} as unknown as D1Database;

		const out = await runTranslateBatch(db, "u1", 1, {
			config: {
				user_id: "u1",
				provider: "openai",
				model: "m",
				base_url: null,
				api_key_ciphertext: new ArrayBuffer(0),
				api_key_key_version: 1,
				translation_prompt: null,
				summary_prompt: "summarize",
				updated_at_ms: 0,
			},
			apiKey: "sk",
			translateFn: async () => ({ translatedText: "你好", summaryText: "摘要一句" }),
			nowMs: Date.now(),
			deadlineMs: 60_000,
		});

		expect(out.timed_out).toBe(false);
		expect(out.results).toHaveLength(1);
		expect(out.results[0]?.ai_status).toBe("succeeded");
		expect(out.results[0]?.summaryText).toBe("摘要一句");
		expect(items[0]?.summary_text).toBe("摘要一句");
		expect(items[0]?.translated_text).toBe("你好");
	});

	test("markTranslateResult writes summary_text column", async () => {
		const bindsLog: unknown[][] = [];
		const db = {
			prepare(sql: string) {
				expect(sql).toMatch(/summary_text/);
				const binds: unknown[] = [];
				return {
					bind(...a: unknown[]) {
						binds.push(...a);
						return this;
					},
					async run() {
						bindsLog.push([...binds]);
						return { meta: { changes: 1 } };
					},
				};
			},
		} as unknown as D1Database;
		await markTranslateResult(
			db,
			"u1",
			7,
			{ ok: true, translatedText: "t", summaryText: "s" },
			123,
		);
		expect(bindsLog[0]).toEqual([123, "t", "s", "u1", 7]);
	});

	test("markTranslateResult failed path", async () => {
		let sqlHit = "";
		const db = {
			prepare(sql: string) {
				sqlHit = sql;
				return {
					bind() {
						return this;
					},
					async run() {
						return { meta: { changes: 1 } };
					},
				};
			},
		} as unknown as D1Database;
		await markTranslateResult(db, "u1", 1, { ok: false, error: "x" }, 1);
		expect(sqlHit).toMatch(/failed/);
	});

	test("selectTranslateCandidates with itemIds and empty", async () => {
		const db = {
			prepare() {
				return {
					bind() {
						return this;
					},
					async all() {
						return { results: [{ id: 1, text: "a" }] };
					},
				};
			},
		} as unknown as D1Database;
		const rows = await selectTranslateCandidates(db, "u1", 1, {
			limit: TRANSLATE_MAX,
			itemIds: [1, 2],
		});
		expect(rows).toHaveLength(1);
		// empty itemIds falls through to status-based select (same mock)
		const all = await selectTranslateCandidates(db, "u1", 1, { limit: 5 });
		expect(all).toHaveLength(1);
	});

	test("runTranslateBatch returns existing succeeded for item_ids", async () => {
		const db = {
			prepare(sql: string) {
				return {
					bind() {
						return this;
					},
					async all() {
						if (sql.includes("ai_status = 'succeeded'")) {
							return {
								results: [{ id: 9, translated_text: "已译", summary_text: "摘要" }],
							};
						}
						return { results: [] };
					},
					async run() {
						return { meta: { changes: 0 } };
					},
				};
			},
		} as unknown as D1Database;

		const existing = await loadSucceededTranslations(db, "u1", 1, [9]);
		expect(existing).toEqual([
			{
				id: 9,
				ai_status: "succeeded",
				translatedText: "已译",
				summaryText: "摘要",
			},
		]);

		const out = await runTranslateBatch(db, "u1", 1, {
			itemIds: [9],
			limit: 1,
			config: {
				user_id: "u1",
				provider: "openai",
				model: "m",
				base_url: null,
				api_key_ciphertext: new ArrayBuffer(0),
				api_key_key_version: 1,
				translation_prompt: null,
				summary_prompt: null,
				updated_at_ms: 0,
			},
			apiKey: "sk",
			translateFn: async () => {
				throw new Error("should not call");
			},
		});
		expect(out.results).toHaveLength(1);
		expect(out.results[0]?.translatedText).toBe("已译");
	});

	test("resetStalePending returns changes", async () => {
		const db = {
			prepare() {
				return {
					bind() {
						return this;
					},
					async run() {
						return { meta: { changes: 3 } };
					},
				};
			},
		} as unknown as D1Database;
		expect(await resetStalePending(db, "u1", 1, Date.now())).toBe(3);
	});
});
