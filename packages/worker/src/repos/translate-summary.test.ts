import { describe, expect, test } from "vitest";
import { defaultTranslateFn, markTranslateResult, runTranslateBatch } from "./translate.js";

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
});
