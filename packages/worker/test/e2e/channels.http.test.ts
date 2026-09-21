import type { Channel, ChannelArticle } from "@xray/shared";
import { describe, expect, test } from "vitest";
import { dataOf, ingestHeaders, jsonFetch, mintToken, rawHttp } from "./helpers.js";

async function createChannel(actor: "a" | "b" = "a") {
	const response = await jsonFetch("/api/channels", {
		method: "POST",
		headers: { "x-test-actor": actor },
		body: JSON.stringify({ name: `Reports ${crypto.randomUUID()}`, description: "Daily reports" }),
	});
	expect(response.status).toBe(201);
	return dataOf<Channel>(response.body);
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

async function listChannels(actor: "a" | "b" = "a") {
	const response = await jsonFetch("/api/channels", { headers: { "x-test-actor": actor } });
	expect(response.status).toBe(200);
	return dataOf<Channel[]>(response.body);
}

function reorder(ids: number[], actor: "a" | "b" = "a") {
	return jsonFetch("/api/channels/order", {
		method: "PUT",
		headers: { "x-test-actor": actor },
		body: JSON.stringify({ ids }),
	});
}

describe("channels over real HTTP", () => {
	test("full-set ordering is tenant scoped, atomic, persisted and appends new channels", async () => {
		await createChannel();
		await createChannel();
		const foreign = await createChannel("b");
		const before = await listChannels();
		const otherBefore = await listChannels("b");
		expect(before.some((c) => c.id === foreign.id)).toBe(false);
		const ids = before.map((c) => c.id);
		const reversed = [...ids].reverse();
		const foreignSet = [...reversed.slice(0, -1), foreign.id];
		for (const invalid of [
			[],
			reversed.slice(1),
			[...reversed, foreign.id],
			foreignSet,
			[foreign.id],
			[...reversed, reversed[0]],
			[0],
			[-1],
			[1.5],
			["1"],
			[Number.MAX_SAFE_INTEGER + 1],
		]) {
			const response = await jsonFetch("/api/channels/order", {
				method: "PUT",
				body: JSON.stringify({ ids: invalid }),
			});
			expect(response.status, JSON.stringify(invalid)).toBe(400);
			expect(await listChannels()).toEqual(before);
			expect(await listChannels("b")).toEqual(otherBefore);
		}
		expect((await reorder(ids, "b")).status).toBe(400);
		expect(await listChannels()).toEqual(before);
		expect(await listChannels("b")).toEqual(otherBefore);
		for (const body of [
			"{",
			"null",
			"[]",
			"{}",
			'{"ids":"bad"}',
			JSON.stringify({ ids, user_id: "other" }),
		]) {
			expect((await jsonFetch("/api/channels/order", { method: "PUT", body })).status).toBe(400);
		}
		const response = await reorder(reversed);
		expect(response.status).toBe(200);
		const ordered = dataOf<Channel[]>(response.body);
		expect(ordered.map((c) => c.id)).toEqual(reversed);
		expect(ordered.map((c) => c.sortOrder)).toEqual(reversed.map((_, index) => index));
		expect(await listChannels()).toEqual(ordered);
		expect(await listChannels("b")).toEqual(otherBefore);
		const appended = await createChannel();
		expect(appended.sortOrder).toBe(ids.length);
		const withNew = await listChannels();
		expect(withNew.map((c) => c.id)).toEqual([...reversed, appended.id]);
		expect((await reorder(reversed)).status).toBe(400);
		expect(await listChannels()).toEqual(withNew);
	});

	test("concurrent ordering returns complete transaction snapshots", async () => {
		await createChannel();
		await createChannel();
		const before = await listChannels();
		const ids = before.map((c) => c.id);
		const reversed = [...ids].reverse();
		const rotated = [...ids.slice(1), ...ids.slice(0, 1)];
		const responses = await Promise.all([reorder(reversed), reorder(rotated)]);
		for (const [index, response] of responses.entries()) {
			expect(response.status).toBe(200);
			const rows = dataOf<Channel[]>(response.body);
			expect(rows.map((c) => c.id)).toEqual(index === 0 ? reversed : rotated);
			expect(rows.map((c) => c.sortOrder)).toEqual(ids.map((_, i) => i));
		}
		const settled = await listChannels();
		expect([reversed, rotated]).toContainEqual(settled.map((c) => c.id));
		const target = [...settled.map((c) => c.id)].reverse();
		const [raced, appended] = await Promise.all([reorder(target), createChannel()]);
		expect([200, 400]).toContain(raced.status);
		const expected = raced.status === 200 ? target : settled.map((c) => c.id);
		if (raced.status === 200)
			expect(dataOf<Channel[]>(raced.body).map((c) => c.id)).toEqual(target);
		const final = await listChannels();
		expect(final.map((c) => c.id)).toEqual([...expected, appended.id]);
		expect(final.map((c) => c.sortOrder)).toEqual(final.map((_, i) => i));
	});

	test("stats separate latest report date from receipt time and exclude revoked keys", async () => {
		const channel = await createChannel();
		expect(channel).toMatchObject({
			articleCount: 0,
			activeKeyCount: 0,
			latestReportDate: null,
			lastReceivedAtMs: null,
		});
		const key = await createKey(channel.id);
		const revoked = await createKey(channel.id, "Revoked");
		const otherBefore = await listChannels("b");
		const receipts: number[] = [];
		for (const date of ["2026-09-22", "2025-01-01"]) {
			const payload = article(crypto.randomUUID(), date);
			const response = await submit(key.token, payload);
			expect(response.status).toBe(201);
			const { id } = dataOf<{ id: number }>(JSON.parse(response.text));
			const detail = await jsonFetch(`/api/channels/${channel.id}/articles/${id}`);
			expect(detail.status).toBe(200);
			receipts.push(dataOf<ChannelArticle>(detail.body).createdAtMs);
			expect((await submit(key.token, payload)).status).toBe(200);
		}
		const find = async () => (await listChannels()).find((c) => c.id === channel.id);
		expect(await find()).toMatchObject({
			articleCount: 2,
			activeKeyCount: 2,
			latestReportDate: "2026-09-22",
			lastReceivedAtMs: Math.max(...receipts),
		});
		expect(
			(await jsonFetch(`/api/channels/${channel.id}/keys/${revoked.id}`, { method: "DELETE" }))
				.status,
		).toBe(200);
		expect((await submit(revoked.token, article())).status).toBe(401);
		expect(await find()).toMatchObject({
			articleCount: 2,
			activeKeyCount: 1,
			latestReportDate: "2026-09-22",
			lastReceivedAtMs: Math.max(...receipts),
		});
		expect(await listChannels("b")).toEqual(otherBefore);
	});

	test("delete cascades reports and keys without affecting another tenant or channel", async () => {
		const channel = await createChannel();
		const survivor = await createChannel();
		const survivorKey = await createKey(survivor.id);
		const key = await createKey(channel.id);
		const revoked = await createKey(channel.id, "Revoked");
		const response = await submit(key.token, article());
		expect(response.status).toBe(201);
		const { id } = dataOf<{ id: number }>(JSON.parse(response.text));
		expect(
			(await jsonFetch(`/api/channels/${channel.id}/keys/${revoked.id}`, { method: "DELETE" }))
				.status,
		).toBe(200);
		const before = await listChannels();
		const otherBefore = await listChannels("b");
		expect(
			(
				await jsonFetch(`/api/channels/${channel.id}`, {
					method: "DELETE",
					headers: { "x-test-actor": "b" },
				})
			).status,
		).toBe(404);
		expect(await listChannels()).toEqual(before);
		const removed = await jsonFetch(`/api/channels/${channel.id}`, { method: "DELETE" });
		expect(removed.status).toBe(200);
		expect(dataOf(removed.body)).toEqual({ deleted: true });
		expect(await listChannels()).toEqual(before.filter((c) => c.id !== channel.id));
		expect(await listChannels("b")).toEqual(otherBefore);
		expect((await jsonFetch(`/api/channels/${channel.id}`, { method: "DELETE" })).status).toBe(404);
		expect((await jsonFetch(`/api/channels/${channel.id}/articles`)).status).toBe(404);
		expect((await jsonFetch(`/api/channels/${channel.id}/articles/${id}`)).status).toBe(404);
		expect((await jsonFetch(`/api/channels/${channel.id}/keys`)).status).toBe(404);
		expect((await submit(key.token, article())).status).toBe(401);
		expect((await submit(revoked.token, article())).status).toBe(401);
		expect((await submit(survivorKey.token, article())).status).toBe(201);
		expect((await reorder(before.map((c) => c.id))).status).toBe(400);
	});

	test("management mutations reject ingest hosts and foreign browser origins", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		const before = await listChannels();
		for (const [path, method] of [
			[`/api/channels/${channel.id}`, "DELETE"],
			["/api/channels/order", "PUT"],
		] as const) {
			const body = JSON.stringify({ ids: before.map((c) => c.id) });
			expect(
				(await rawHttp(path, { method, headers: ingestHeaders(key.token), body })).status,
			).toBe(404);
			expect(
				(await jsonFetch(path, { method, headers: { origin: "https://evil.example" }, body }))
					.status,
			).toBe(403);
		}
		expect(await listChannels()).toEqual(before);
	});

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
			expect.objectContaining({
				id: result.id,
				title: payload.title,
				sourceLabel: "Research Agent",
			}),
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
			expect.objectContaining({
				id: key.id,
				channelId: channel.id,
				lastUsedAtMs: expect.any(Number),
			}),
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
		expect(
			(await jsonFetch(`/api/channels/${other.id}/keys/${key.id}`, { method: "DELETE" })).status,
		).toBe(404);
		const watchlistKey = await mintToken("Existing watchlist producer");
		expect((await submit(watchlistKey.token, article())).status).toBe(403);
		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(key.token) })).status,
		).toBe(403);
		expect(
			(
				await rawHttp("/api/push-tokens", {
					method: "POST",
					headers: ingestHeaders(key.token),
					body: '{"label":"forbidden"}',
				})
			).status,
		).toBe(404);
		expect(
			(await rawHttp(`/api/channels/${own.id}/articles`, { headers: ingestHeaders(key.token) }))
				.status,
		).toBe(404);
		expect(
			(
				await rawHttp("/api/v1/ingest/articles", {
					method: "POST",
					headers: { ...ingestHeaders(key.token), host: "xray.hexly.ai" },
					body: JSON.stringify(article()),
				})
			).status,
		).toBe(404);
	});

	test("revocation stops ingestion and retains already received reports", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		const submitted = await submit(key.token, article());
		expect(submitted.status).toBe(201);
		const { id } = dataOf<{ id: number }>(JSON.parse(submitted.text));
		const revoked = await jsonFetch(`/api/channels/${channel.id}/keys/${key.id}`, {
			method: "DELETE",
		});
		expect(revoked.status).toBe(200);
		expect((await submit(key.token, article())).status).toBe(401);
		expect((await jsonFetch(`/api/channels/${channel.id}/articles/${id}`)).status).toBe(200);
		expect(dataOf<unknown[]>((await jsonFetch(`/api/channels/${channel.id}/keys`)).body)).toEqual(
			[],
		);
	});

	test("date-aware cursors page through backdated reports without skipping or repeating", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		for (const date of ["2025-01-01", "2026-09-22", "2026-09-21", "2026-09-22"]) {
			expect((await submit(key.token, article(crypto.randomUUID(), date))).status).toBe(201);
		}
		type Page = { items: { id: number; reportDate: string }[]; nextCursor: number | null };
		const first = dataOf<Page>(
			(await jsonFetch(`/api/channels/${channel.id}/articles?limit=2`)).body,
		);
		expect(first.items.map((row) => row.reportDate)).toEqual(["2026-09-22", "2026-09-22"]);
		expect(first.items[0].id).toBeGreaterThan(first.items[1].id);
		expect(first.nextCursor).toBe(first.items[1].id);
		const next = dataOf<Page>(
			(await jsonFetch(`/api/channels/${channel.id}/articles?limit=2&before=${first.nextCursor}`))
				.body,
		);
		expect(next.items.map((row) => row.reportDate)).toEqual(["2026-09-21", "2025-01-01"]);
		expect(next.nextCursor).toBeNull();
		const filtered = dataOf<Page>(
			(await jsonFetch(`/api/channels/${channel.id}/articles?date=2026-09-22`)).body,
		);
		expect(filtered.items).toHaveLength(2);
		expect((await jsonFetch(`/api/channels/${channel.id}/articles?date=2026-02-30`)).status).toBe(
			400,
		);
	});

	test("invalid payloads and oversized text never create articles", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		for (const payload of [
			null,
			{},
			{ ...article(), report_date: "2026-02-30" },
			{ ...article(), title: " " },
			{ ...article(), title: "a".repeat(241) },
		]) {
			expect((await submit(key.token, payload)).status).toBe(400);
		}
		expect((await submit("invalid-token", article())).status).toBe(401);
		const huge = await submit(key.token, { ...article(), markdown: "汉".repeat(400_000) });
		expect(huge.status).toBe(413);
		expect(
			dataOf<{ items: unknown[] }>((await jsonFetch(`/api/channels/${channel.id}/articles`)).body)
				.items,
		).toEqual([]);
	});
});
