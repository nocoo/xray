import { describe, expect, test } from "vitest";
import { dataOf, ingestHeaders, jsonFetch, mintToken, rawHttp } from "./helpers.js";

async function createChannel() {
	const response = await jsonFetch("/api/channels", {
		method: "POST",
		body: JSON.stringify({ name: `Reports ${crypto.randomUUID()}`, description: "Daily reports" }),
	});
	expect(response.status).toBe(201);
	return dataOf<{ id: number; name: string }>(response.body);
}

async function createKey(channelId: number, label = "Research Agent") {
	const response = await jsonFetch(`/api/channels/${channelId}/keys`, {
		method: "POST",
		body: JSON.stringify({ label }),
	});
	expect(response.status).toBe(201);
	return dataOf<{ id: number; token: string }>(response.body);
}

function article(externalId = crypto.randomUUID(), date = "2026-09-22") {
	return {
		external_id: externalId,
		title: "研发日报 · 2026-09-22",
		report_date: date,
		summary: "A brief report",
		author: "Research Team",
		markdown: "## 今日进展\n\n中文与 English。\n\n![Diagram](https://example.com/chart.png)",
	};
}

function submit(token: string, body: unknown) {
	return rawHttp("/api/v1/ingest/articles", {
		method: "POST",
		headers: ingestHeaders(token),
		body: JSON.stringify(body),
	});
}

describe("channels over real HTTP", () => {
	test("create, rename, submit, list and read a report without exposing keys", async () => {
		const channel = await createChannel();
		const renamed = await jsonFetch(`/api/channels/${channel.id}`, {
			method: "PATCH",
			body: JSON.stringify({ name: "Daily Research", description: "Updated" }),
		});
		expect(renamed.status).toBe(200);
		expect(dataOf<{ name: string }>(renamed.body).name).toBe("Daily Research");
		const key = await createKey(channel.id);
		const payload = article();
		const submitted = await submit(key.token, payload);
		expect(submitted.status).toBe(201);
		const result = dataOf<{ id: number; channelId: number; url: string; duplicate: boolean }>(
			JSON.parse(submitted.text),
		);
		expect(result).toMatchObject({ channelId: channel.id, duplicate: false });
		expect(result.url).toContain(`/channels/${channel.id}/articles/${result.id}`);
		const listed = await jsonFetch(`/api/channels/${channel.id}/articles`);
		expect(listed.status).toBe(200);
		expect(dataOf<{ items: object[] }>(listed.body).items).toEqual([
			expect.objectContaining({ id: result.id, title: payload.title, sourceLabel: "Research Agent" }),
		]);
		expect(JSON.stringify(listed.body)).not.toContain("markdown");
		const detail = await jsonFetch(`/api/channels/${channel.id}/articles/${result.id}`);
		expect(detail.status).toBe(200);
		expect(dataOf<{ markdown: string }>(detail.body).markdown).toBe(payload.markdown);
		const channels = await jsonFetch("/api/channels");
		expect(dataOf<object[]>(channels.body)).toContainEqual(
			expect.objectContaining({ id: channel.id, articleCount: 1 }),
		);
		const keys = await jsonFetch(`/api/channels/${channel.id}/keys`);
		expect(keys.status).toBe(200);
		expect(JSON.stringify(keys.body)).not.toContain(key.token);
		expect(dataOf<object[]>(keys.body)).toContainEqual(
			expect.objectContaining({ id: key.id, channelId: channel.id, lastUsedAtMs: expect.any(Number) }),
		);
	});

	test("retries are atomic, conflicts preserve original content and provenance", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		const second = await createKey(channel.id, "Another producer");
		const payload = article();
		const retries = await Promise.all([submit(key.token, payload), submit(key.token, payload)]);
		expect(retries.map((r) => r.status).sort()).toEqual([200, 201]);
		const ids = retries.map((r) => dataOf<{ id: number }>(JSON.parse(r.text)).id);
		expect(ids[0]).toBe(ids[1]);
		expect((await submit(key.token, { ...payload, markdown: "Replacement" })).status).toBe(409);
		expect((await submit(second.token, payload)).status).toBe(409);
		const read = await jsonFetch(`/api/channels/${channel.id}/articles/${ids[0]}`);
		expect(dataOf<{ markdown: string; sourceLabel: string }>(read.body)).toMatchObject({
			markdown: payload.markdown,
			sourceLabel: "Research Agent",
		});
	});

	test("tenant, channel, key scopes and hostname form separate permission boundaries", async () => {
		const own = await createChannel();
		const other = await createChannel();
		const key = await createKey(own.id);
		const posted = await submit(key.token, article());
		const { id } = dataOf<{ id: number }>(JSON.parse(posted.text));
		for (const [method, path, body] of [
			["PATCH", `/api/channels/${own.id}`, { name: "Hijacked" }],
			["GET", `/api/channels/${own.id}/articles`, undefined],
			["GET", `/api/channels/${own.id}/articles/${id}`, undefined],
			["GET", `/api/channels/${own.id}/keys`, undefined],
			["POST", `/api/channels/${own.id}/keys`, { label: "Hijacked" }],
			["DELETE", `/api/channels/${own.id}/keys/${key.id}`, undefined],
		] as const) {
			const response = await jsonFetch(path, {
				method,
				headers: { "x-test-actor": "b" },
				body: body ? JSON.stringify(body) : undefined,
			});
			expect(response.status, `${method} ${path}`).toBe(404);
		}
		expect((await jsonFetch(`/api/channels/${other.id}/articles/${id}`)).status).toBe(404);
		expect((await jsonFetch(`/api/channels/${other.id}/keys/${key.id}`, { method: "DELETE" })).status).toBe(404);
		const watchlistKey = await mintToken("Existing watchlist producer");
		expect((await submit(watchlistKey.token, article())).status).toBe(403);
		expect((await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(key.token) })).status).toBe(403);
		expect((await rawHttp("/api/push-tokens", { method: "POST", headers: ingestHeaders(key.token), body: '{"label":"forbidden"}' })).status).toBe(404);
		expect((await rawHttp(`/api/channels/${own.id}/articles`, { headers: ingestHeaders(key.token) })).status).toBe(404);
		expect((await rawHttp("/api/v1/ingest/articles", { method: "POST", headers: { ...ingestHeaders(key.token), host: "xray.hexly.ai" }, body: JSON.stringify(article()) })).status).toBe(404);
	});

	test("revocation stops ingestion and retains already received reports", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		const submitted = await submit(key.token, article());
		expect(submitted.status).toBe(201);
		const { id } = dataOf<{ id: number }>(JSON.parse(submitted.text));
		const revoked = await jsonFetch(`/api/channels/${channel.id}/keys/${key.id}`, { method: "DELETE" });
		expect(revoked.status).toBe(200);
		expect((await submit(key.token, article())).status).toBe(401);
		expect((await jsonFetch(`/api/channels/${channel.id}/articles/${id}`)).status).toBe(200);
		expect(dataOf<unknown[]>((await jsonFetch(`/api/channels/${channel.id}/keys`)).body)).toEqual([]);
	});

	test("date-aware cursors page through backdated reports without skipping or repeating", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		for (const date of ["2025-01-01", "2026-09-22", "2026-09-21", "2026-09-22"]) {
			expect((await submit(key.token, article(crypto.randomUUID(), date))).status).toBe(201);
		}
		type Page = { items: { id: number; reportDate: string }[]; nextCursor: number | null };
		const first = dataOf<Page>((await jsonFetch(`/api/channels/${channel.id}/articles?limit=2`)).body);
		expect(first.items.map((row) => row.reportDate)).toEqual(["2026-09-22", "2026-09-22"]);
		expect(first.items[0].id).toBeGreaterThan(first.items[1].id);
		expect(first.nextCursor).toBe(first.items[1].id);
		const next = dataOf<Page>((await jsonFetch(`/api/channels/${channel.id}/articles?limit=2&before=${first.nextCursor}`)).body);
		expect(next.items.map((row) => row.reportDate)).toEqual(["2026-09-21", "2025-01-01"]);
		expect(next.nextCursor).toBeNull();
		const filtered = dataOf<Page>((await jsonFetch(`/api/channels/${channel.id}/articles?date=2026-09-22`)).body);
		expect(filtered.items).toHaveLength(2);
		expect((await jsonFetch(`/api/channels/${channel.id}/articles?date=2026-02-30`)).status).toBe(400);
	});

	test("invalid payloads and oversized text never create articles", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		for (const payload of [null, {}, { ...article(), report_date: "2026-02-30" }, { ...article(), title: " " }, { ...article(), title: "a".repeat(241) }]) {
			expect((await submit(key.token, payload)).status).toBe(400);
		}
		expect((await submit("invalid-token", article())).status).toBe(401);
		const huge = await submit(key.token, { ...article(), markdown: "汉".repeat(400_000) });
		expect(huge.status).toBe(413);
		expect(dataOf<{ items: unknown[] }>((await jsonFetch(`/api/channels/${channel.id}/articles`)).body).items).toEqual([]);
	});
});
