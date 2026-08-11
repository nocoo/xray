import { describe, expect, test } from "vitest";
import { readResponseBounded, resolveAiBaseUrl } from "./ai-endpoint.js";

describe("ai-endpoint extra branches", () => {
	test("strips brackets on ipv6 host and trailing dots", () => {
		expect(resolveAiBaseUrl("https://[::]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://api.openai.com./v1").ok).toBe(true);
	});

	test("adds https when scheme missing", () => {
		const r = resolveAiBaseUrl("api.openai.com/v1");
		expect(r.ok).toBe(true);
	});

	test("readResponseBounded empty body and multi-chunk", async () => {
		expect(await readResponseBounded(new Response(null), 10)).toBe("");
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("hello "));
				controller.enqueue(new TextEncoder().encode("world!!!!"));
				controller.close();
			},
		});
		const t = await readResponseBounded(new Response(stream), 8);
		expect(t).toBe("hello wo");
	});

	test("readResponseBounded exact room and zero room", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("abcd"));
				controller.enqueue(new TextEncoder().encode("efgh"));
				controller.close();
			},
		});
		expect(await readResponseBounded(new Response(stream), 4)).toBe("abcd");
		const empty = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(0));
				controller.enqueue(new TextEncoder().encode("x"));
				controller.close();
			},
		});
		expect(await readResponseBounded(new Response(empty), 1)).toBe("x");
	});
});
