import { describe, expect, test } from "vitest";
import { readResponseBounded, resolveAiBaseUrl } from "./ai-endpoint.js";

describe("resolveAiBaseUrl", () => {
	test("defaults to openai https", () => {
		const r = resolveAiBaseUrl(null);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.chatCompletionsUrl).toContain("api.openai.com");
	});

	test("rejects http and private hosts", () => {
		expect(resolveAiBaseUrl("http://api.openai.com/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://127.0.0.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://10.0.0.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://192.168.1.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://172.16.0.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[fc00::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://meta.local/v1").ok).toBe(false);
	});

	test("accepts public https", () => {
		const r = resolveAiBaseUrl("https://api.example.com/v1/");
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.chatCompletionsUrl).toBe("https://api.example.com/v1/chat/completions");
	});

	test("rejects more private patterns", () => {
		expect(resolveAiBaseUrl("https://0.0.0.0/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://169.254.1.1/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://foo.localhost/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://localhost./v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://foo.local./v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[fe80::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[fd12::1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[::ffff:127.0.0.1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("https://[::ffff:7f00:1]/v1").ok).toBe(false);
		expect(resolveAiBaseUrl("not a url!!!").ok).toBe(false);
	});

	test("does not false-positive public fc/fd hostnames", () => {
		expect(resolveAiBaseUrl("https://fc-api.example.com/v1").ok).toBe(true);
		expect(resolveAiBaseUrl("https://fd.example.com/v1").ok).toBe(true);
	});
});

describe("readResponseBounded", () => {
	test("caps bytes and cancels", async () => {
		const big = "x".repeat(100);
		const res = new Response(big, { status: 200 });
		const t = await readResponseBounded(res, 10);
		expect(t.length).toBe(10);
	});
});
