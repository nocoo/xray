import { afterEach, describe, expect, test, vi } from "vitest";
import { chatCompletion, translateAndSummarize } from "./ai-client.js";

const origFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = origFetch;
	vi.restoreAllMocks();
});

describe("chatCompletion", () => {
	test("returns content from OpenAI-shaped JSON", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ choices: [{ message: { content: "  hi  " } }] }), {
					status: 200,
				}),
		) as unknown as typeof fetch;

		const out = await chatCompletion({
			apiKey: "sk",
			baseUrl: "https://api.example.com/v1",
			messages: [{ role: "user", content: "ping" }],
		});
		expect(out.content).toBe("hi");
	});

	test("rejects private baseUrl", async () => {
		await expect(
			chatCompletion({
				apiKey: "sk",
				baseUrl: "https://127.0.0.1/v1",
				messages: [{ role: "user", content: "x" }],
			}),
		).rejects.toThrow(/not allowed|https/i);
	});
});

describe("translateAndSummarize", () => {
	test("two calls when summary prompt set", async () => {
		let n = 0;
		globalThis.fetch = vi.fn(async () => {
			n += 1;
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: n === 1 ? "译文" : "摘要" } }],
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		const out = await translateAndSummarize({
			text: "hello",
			apiKey: "sk",
			baseUrl: "https://api.example.com/v1",
			translationPrompt: "tr",
			summaryPrompt: "sum",
		});
		expect(out.translatedText).toBe("译文");
		expect(out.summaryText).toBe("摘要");
		expect(n).toBe(2);
	});

	test("summary null without prompt", async () => {
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ choices: [{ message: { content: "译" } }] }), {
					status: 200,
				}),
		) as unknown as typeof fetch;

		const out = await translateAndSummarize({
			text: "hello",
			apiKey: "sk",
			baseUrl: "https://api.example.com/v1",
			summaryPrompt: null,
		});
		expect(out.summaryText).toBeNull();
	});
});
