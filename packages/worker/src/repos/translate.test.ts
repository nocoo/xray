import { describe, expect, test } from "vitest";
import { defaultTranslateFn, resetStalePending, TRANSLATE_MAX } from "./translate.js";

describe("translate helpers", () => {
	test("TRANSLATE_MAX is 20", () => {
		expect(TRANSLATE_MAX).toBe(20);
	});

	test("defaultTranslateFn posts chat completions", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ choices: [{ message: { content: " 你好 " } }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})) as typeof fetch;
		try {
			const out = await defaultTranslateFn({
				text: "hi",
				apiKey: "sk",
				provider: "openai",
				model: "m",
				baseUrl: "https://api.example.com/v1",
				translationPrompt: null,
				summaryPrompt: null,
				signal: new AbortController().signal,
			});
			expect(out.translatedText).toBe("你好");
		} finally {
			globalThis.fetch = orig;
		}
	});

	test("defaultTranslateFn fails on upstream error", async () => {
		const orig = globalThis.fetch;
		globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
		try {
			await expect(
				defaultTranslateFn({
					text: "hi",
					apiKey: "sk",
					provider: "openai",
					model: null,
					baseUrl: null,
					translationPrompt: null,
					summaryPrompt: null,
					signal: new AbortController().signal,
				}),
			).rejects.toThrow(/upstream 500/);
		} finally {
			globalThis.fetch = orig;
		}
	});

	test("resetStalePending runs update", async () => {
		let ran = false;
		const db = {
			prepare() {
				return {
					bind() {
						return this;
					},
					async run() {
						ran = true;
						return { meta: { changes: 2 } };
					},
				};
			},
		} as unknown as D1Database;
		const n = await resetStalePending(db, "u1", 1, Date.now());
		expect(ran).toBe(true);
		expect(n).toBe(2);
	});
});
