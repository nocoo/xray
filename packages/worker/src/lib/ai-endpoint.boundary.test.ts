import { describe, expect, test, vi } from "vitest";
import { readResponseBounded, resolveAiBaseUrl } from "./ai-endpoint.js";

describe("AI endpoint network boundaries", () => {
	test.each([
		["https://172.15.255.255/v1", true],
		["https://172.31.255.255/v1", false],
		["https://172.32.0.1/v1", true],
		["https://169.253.1.1/v1", true],
		["https://192.169.1.1/v1", true],
		["https://[::]/v1", false],
		["https://[::ffff:8.8.8.8]/v1", true],
		["https://[2001:4860:4860::8888]/v1", true],
		["https://service.internal/v1", false],
	] as const)("classifies %s without network access", (url, allowed) => {
		const result = resolveAiBaseUrl(url);
		expect(result.ok).toBe(allowed);
		if (!result.ok) expect(result.error).toBe("baseUrl host not allowed");
	});
});

describe("bounded response stream lifecycle", () => {
	test("returns empty for a bodyless response", async () => {
		expect(await readResponseBounded(new Response(null, { status: 204 }), 10)).toBe("");
	});

	test("reads multiple chunks, tolerates empty chunks and releases the lock", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array());
				controller.enqueue(new TextEncoder().encode("hel"));
				controller.enqueue(new TextEncoder().encode("lo"));
				controller.close();
			},
		});
		expect(await readResponseBounded(new Response(stream), 10)).toBe("hello");
		expect(stream.locked).toBe(false);
	});

	test("cancels the unread remainder when a chunk exactly fills the limit", async () => {
		const cancel = vi.fn();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("abc"));
				controller.enqueue(new TextEncoder().encode("discard"));
			},
			cancel,
		});
		expect(await readResponseBounded(new Response(stream), 3)).toBe("abc");
		expect(cancel).toHaveBeenCalledOnce();
		expect(stream.locked).toBe(false);
	});

	test.each([0, 2])(
		"keeps the bounded prefix even if cancellation rejects at %i bytes",
		async (limit) => {
			const cancel = vi.fn(async () => {
				throw new Error("upstream cancel failed");
			});
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("abcd"));
				},
				cancel,
			});
			expect(await readResponseBounded(new Response(stream), limit)).toBe("abcd".slice(0, limit));
			expect(cancel).toHaveBeenCalledOnce();
			expect(stream.locked).toBe(false);
		},
	);

	test("propagates stream failure and releases the reader", async () => {
		const error = new Error("upstream read failed");
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.error(error);
			},
		});
		await expect(readResponseBounded(new Response(stream), 10)).rejects.toBe(error);
		expect(stream.locked).toBe(false);
	});
});
