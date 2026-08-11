import { describe, expect, test } from "vitest";
import type { CanonicalItem } from "./canonical-item.js";
import { pushIngestBatch } from "./producer-push.js";

const item: CanonicalItem = {
	source_type: "custom",
	external_id: "c1",
	created_at: "2026-08-10T12:00:00.000Z",
	body: { kind: "custom", text: "hello" },
};

const body = { watchlist_id: 1, items: [item] };

describe("pushIngestBatch branches", () => {
	test("sets host header for localhost base", async () => {
		let sawHost = false;
		const r = await pushIngestBatch(
			{
				fetch: async (_url, init) => {
					sawHost = init.headers.host === "xray-ingest.hexly.ai";
					return {
						status: 200,
						ok: true,
						text: async () => JSON.stringify({ ok: true, accepted: 1, deduped: 0, rejected: 0 }),
					};
				},
				sleep: async () => {},
				ingestBase: "http://127.0.0.1:8787/",
				pushToken: "tok",
			},
			body,
		);
		expect(r.ok).toBe(true);
		expect(sawHost).toBe(true);
	});

	test("network error retries then fails", async () => {
		let calls = 0;
		const r = await pushIngestBatch(
			{
				fetch: async () => {
					calls += 1;
					throw new Error("offline");
				},
				sleep: async () => {},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
				maxAttempts: 2,
			},
			body,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.status).toBe(0);
			expect(r.error).toContain("offline");
		}
		expect(calls).toBe(2);
	});

	test("non-json 200 fails parse", async () => {
		const r = await pushIngestBatch(
			{
				fetch: async () => ({
					status: 200,
					ok: true,
					text: async () => "not-json",
				}),
				sleep: async () => {},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			},
			body,
		);
		expect(r.ok).toBe(false);
	});

	test("400 without retry when not retryable", async () => {
		let calls = 0;
		const r = await pushIngestBatch(
			{
				fetch: async () => {
					calls += 1;
					return {
						status: 400,
						ok: false,
						text: async () => JSON.stringify({ error: "bad" }),
					};
				},
				sleep: async () => {},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			},
			body,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe("bad");
		expect(calls).toBe(1);
	});

	test("429 retries then fails with text body", async () => {
		let calls = 0;
		const r = await pushIngestBatch(
			{
				fetch: async () => {
					calls += 1;
					return { status: 429, ok: false, text: async () => "slow down" };
				},
				sleep: async () => {},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
				maxAttempts: 2,
			},
			body,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("slow");
		expect(calls).toBe(2);
	});

	test("403 fatal with plain text", async () => {
		const r = await pushIngestBatch(
			{
				fetch: async () => ({ status: 403, ok: false, text: async () => "forbidden" }),
				sleep: async () => {},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			},
			body,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.fatal).toBe(true);
			expect(r.error).toContain("forbidden");
		}
	});
});
