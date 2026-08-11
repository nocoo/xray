import { describe, expect, test } from "vitest";
import type { CanonicalItem } from "./canonical-item.js";
import { pushIngestBatch } from "./producer-push.js";

const item: CanonicalItem = {
	source_type: "custom",
	external_id: "c1",
	created_at: "2026-08-10T12:00:00.000Z",
	body: { kind: "custom", text: "hello" },
};

function body() {
	return { watchlist_id: 1, items: [item], options: { apply_window_hours: 24 } };
}

describe("pushIngestBatch", () => {
	test("401 is fatal without retry", async () => {
		let calls = 0;
		const sleeps: number[] = [];
		const r = await pushIngestBatch(
			{
				fetch: async () => {
					calls += 1;
					return { status: 401, ok: false, text: async () => JSON.stringify({ error: "nope" }) };
				},
				sleep: async (ms) => {
					sleeps.push(ms);
				},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "xray_pt_test",
			},
			body(),
		);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.fatal).toBe(true);
			expect(r.status).toBe(401);
		}
		expect(calls).toBe(1);
		expect(sleeps.length).toBe(0);
	});

	test("retries 503 then succeeds", async () => {
		let calls = 0;
		const sleeps: number[] = [];
		const r = await pushIngestBatch(
			{
				fetch: async () => {
					calls += 1;
					if (calls === 1) {
						return { status: 503, ok: false, text: async () => "busy" };
					}
					return {
						status: 200,
						ok: true,
						text: async () => JSON.stringify({ ok: true, accepted: 1, deduped: 0, rejected: 0 }),
					};
				},
				sleep: async (ms) => {
					sleeps.push(ms);
				},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			},
			body(),
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.accepted).toBe(1);
		expect(calls).toBe(2);
		expect(sleeps.length).toBe(1);
	});

	test("rejects unbalanced 200 body", async () => {
		const r = await pushIngestBatch(
			{
				fetch: async () => ({
					status: 200,
					ok: true,
					text: async () => JSON.stringify({ ok: true, accepted: 0, deduped: 0, rejected: 0 }),
				}),
				sleep: async () => {},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			},
			body(),
		);
		expect(r.ok).toBe(false);
	});
});
