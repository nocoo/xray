import { describe, expect, test } from "vitest";
import { defaultTranslateFn } from "./translate.js";

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
