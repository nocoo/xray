import type { ArticlePage, Channel, ChannelArticle, Tag } from "@xray/shared";
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
			(await jsonFetch(`/api/channels/${channel.id}/articles?date_from=2026-09-22&date_to=2026-09-22`)).body,
		);
		expect(filtered.items).toHaveLength(2);
		expect((await jsonFetch(`/api/channels/${channel.id}/articles?date_from=2026-02-30`)).status).toBe(
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

describe('browser tags and article mutations', () => {
 test('central tags, atomic tenant associations and cascade only associations', async () => {
 const channel = await createChannel();
 const key = await createKey(channel.id);
 const created = await jsonFetch('/api/tags',{method:'POST',body:JSON.stringify({name:`Tag ${crypto.randomUUID()}`})});
 expect(created.status).toBe(201);
 const tag = dataOf<{id:number;name:string}>(created.body);
 const foreign = dataOf<{id:number}>((await jsonFetch('/api/tags',{method:'POST',headers:{'x-test-actor':'b'},body:JSON.stringify({name:`Foreign ${crypto.randomUUID()}`})})).body);
 const renamed = await jsonFetch(`/api/tags/${tag.id}`,{method:'PATCH',body:JSON.stringify({name:`${tag.name} renamed`})});
 expect(renamed.status).toBe(200);
 const desired = [dataOf(renamed.body)];
 expect((await jsonFetch(`/api/channels/${channel.id}/tags`,{method:'PUT',body:JSON.stringify({tagIds:[tag.id]})})).status).toBe(200);
 expect((await jsonFetch(`/api/channels/${channel.id}/keys/${key.id}/tags`,{method:'PUT',body:JSON.stringify({tagIds:[tag.id]})})).status).toBe(200);
 for (const path of [`/api/channels/${channel.id}/tags`,`/api/channels/${channel.id}/keys/${key.id}/tags`]) {
 for (const tagIds of [[tag.id,foreign.id],[tag.id,tag.id],[0],[99999999],Array.from({length:21},(_,i)=>i+1)]) expect((await jsonFetch(path,{method:'PUT',body:JSON.stringify({tagIds})})).status).toBe(400);
 expect((await jsonFetch(path,{method:'PUT',headers:{'x-test-actor':'b'},body:JSON.stringify({tagIds:[]})})).status).toBe(400);
 expect((await rawHttp(path,{method:'PUT',headers:ingestHeaders(key.token),body:JSON.stringify({tagIds:[]})})).status).toBe(404);
 }
 expect((await listChannels()).find(c=>c.id===channel.id)?.tags).toEqual(desired);
 expect(dataOf<{tags:unknown[]}[]>((await jsonFetch(`/api/channels/${channel.id}/keys`)).body)[0]?.tags).toEqual(desired);
 expect((await jsonFetch(`/api/tags/${tag.id}`,{method:'DELETE',headers:{'x-test-actor':'b'}})).status).toBe(404);
 expect((await jsonFetch(`/api/tags/${tag.id}`,{method:'DELETE'})).status).toBe(200);
 expect((await listChannels()).find(c=>c.id===channel.id)?.tags).toEqual([]);
 expect(dataOf<{tags:unknown[]}[]>((await jsonFetch(`/api/channels/${channel.id}/keys`)).body)[0]?.tags).toEqual([]);
 });
 test('browser edits preserve immutable fields and ingest retry safety; deletion releases external id',async()=>{
 const channel=await createChannel();const key=await createKey(channel.id);const input=article();
 const created=await submit(key.token,input);expect(created.status).toBe(201);
 const id=(JSON.parse(created.text) as {id:number}).id;
 const path=`/api/channels/${channel.id}/articles/${id}`;
 const patch={title:'Edited',report_date:'2026-09-21',markdown:'New body'};
 expect((await jsonFetch(`/api/channels/${channel.id}/articles/${id}`,{method:'PATCH',body:JSON.stringify(patch)})).status).toBe(200);
 expect((await jsonFetch(path,{method:'PATCH',headers:{'x-test-actor':'b'},body:JSON.stringify(patch)})).status).toBe(404);
 expect((await jsonFetch(path,{method:'PATCH',body:JSON.stringify({...patch,external_id:'changed'})})).status).toBe(400);
 expect((await submit(key.token,input)).status).toBe(409);
 expect(dataOf<ChannelArticle>((await jsonFetch(path)).body)).toMatchObject({title:'Edited',externalId:input.external_id,sourceLabel:'Research Agent'});
 for (const method of ['PATCH','DELETE']) expect((await rawHttp(path,{method,headers:ingestHeaders(key.token),body:JSON.stringify(patch)})).status).toBe(404);
 expect((await jsonFetch(path,{method:'DELETE',headers:{'x-test-actor':'b'}})).status).toBe(404);
 expect((await jsonFetch(`/api/channels/${channel.id}/articles/${id}`,{method:'DELETE'})).status).toBe(200);
 expect((await submit(key.token,input)).status).toBe(201);
 });
});


describe("merged article tags over HTTP", () => {
	test("live union has list/detail/edit parity and retains revoked source tags", async () => {
		const channel = await createChannel();
		const key = await createKey(channel.id);
		const suffix = crypto.randomUUID();
		async function tag(name: string, actor = "a") {
			const response = await jsonFetch("/api/tags", {
				method: "POST",
				headers: { "x-test-actor": actor },
				body: JSON.stringify({ name: `${name} ${suffix}` }),
			});
			expect(response.status).toBe(201);
			const { id, name: savedName } = dataOf<Tag>(response.body);
			return { id, name: savedName };
		}
		const tokenOnly = await tag("Alpha");
		const channelOnly = await tag("Beta");
		const shared = await tag("Gamma");
		const foreign = await tag("Foreign", "b");
		const channelTagsPath = `/api/channels/${channel.id}/tags`;
		const keyTagsPath = `/api/channels/${channel.id}/keys/${key.id}/tags`;
		async function replace(path: string, tags: Tag[]) {
			return jsonFetch(path, {
				method: "PUT",
				body: JSON.stringify({ tagIds: tags.map((t) => t.id) }),
			});
		}
		expect((await replace(channelTagsPath, [shared, channelOnly])).status).toBe(200);
		expect((await replace(keyTagsPath, [shared, tokenOnly])).status).toBe(200);
		for (const path of [channelTagsPath, keyTagsPath])
			expect((await replace(path, [shared, foreign])).status).toBe(400);
		const input = article();
		const submitted = await submit(key.token, input);
		expect(submitted.status).toBe(201);
		const { id } = dataOf<{ id: number }>(JSON.parse(submitted.text));
		const articlePath = `/api/channels/${channel.id}/articles/${id}`;
		async function assertTags(tags: Tag[]) {
			const detail = await jsonFetch(articlePath);
			expect(detail.status).toBe(200);
			const full = dataOf<ChannelArticle>(detail.body);
			expect(full.tags).toEqual(tags);
			const list = await jsonFetch(`/api/channels/${channel.id}/articles`);
			expect(list.status).toBe(200);
			const { markdown: _, ...summary } = full;
			expect(dataOf<ArticlePage>(list.body).items).toEqual([summary]);
			for (const body of [detail.body, list.body]) {
				const serialized = JSON.stringify(body);
				expect(serialized).not.toContain(key.token);
				expect(serialized).not.toContain("token_hash");
				expect(serialized).not.toContain(foreign.name);
			}
		}
		const merged = [tokenOnly, channelOnly, shared];
		await assertTags(merged);
		expect((await submit(key.token, input)).status).toBe(200);
		for (const path of [articlePath, `/api/channels/${channel.id}/articles`])
			expect((await jsonFetch(path, { headers: { "x-test-actor": "b" } })).status).toBe(404);
		const patch = { title: "Edited", report_date: input.report_date, markdown: "Edited body" };
		const edited = await jsonFetch(articlePath, { method: "PATCH", body: JSON.stringify(patch) });
		expect(edited.status).toBe(200);
		expect(dataOf<ChannelArticle>(edited.body)).toMatchObject({
			tags: merged,
			externalId: input.external_id,
			sourceLabel: "Research Agent",
		});
		await assertTags(merged);
		expect((await replace(channelTagsPath, [])).status).toBe(200);
		await assertTags([tokenOnly, shared]);
		expect((await replace(keyTagsPath, [])).status).toBe(200);
		await assertTags([]);
		expect((await replace(channelTagsPath, [channelOnly])).status).toBe(200);
		await assertTags([channelOnly]);
		expect((await replace(keyTagsPath, [tokenOnly])).status).toBe(200);
		expect(
			(await jsonFetch(`/api/channels/${channel.id}/keys/${key.id}`, { method: "DELETE" })).status,
		).toBe(200);
		expect((await submit(key.token, article())).status).toBe(401);
		await assertTags([tokenOnly, channelOnly]);
		const renamed = { ...tokenOnly, name: `Zulu ${suffix}` };
		expect(
			(
				await jsonFetch(`/api/tags/${tokenOnly.id}`, {
					method: "PATCH",
					body: JSON.stringify({ name: renamed.name }),
				})
			).status,
		).toBe(200);
		await assertTags([channelOnly, renamed]);
		expect((await jsonFetch(`/api/tags/${tokenOnly.id}`, { method: "DELETE" })).status).toBe(200);
		await assertTags([channelOnly]);
		expect((await jsonFetch(`/api/tags/${channelOnly.id}`, { method: "DELETE" })).status).toBe(200);
		await assertTags([]);
	});
});

test("article filters combine before pagination with tenant-safe live tag ANY matching", async () => {
 const channel = await createChannel();
 const key = await createKey(channel.id);
 const tags: Tag[] = [];
 for (const actor of ["a","a","b"] as const) {
 const r = await jsonFetch("/api/tags",{method:"POST",headers:{"x-test-actor":actor},body:JSON.stringify({name:`Filter ${crypto.randomUUID()}`})});
 expect(r.status).toBe(201);
 tags.push(dataOf<Tag>(r.body));
 }
 const [channelTag,tokenTag,foreignTag] = tags;
 if(!channelTag || !tokenTag || !foreignTag) throw new Error("missing tags");
 for (const [path,tagIds] of [
 [`/api/channels/${channel.id}/tags`,[channelTag.id]],
 [`/api/channels/${channel.id}/keys/${key.id}/tags`,[channelTag.id,tokenTag.id]],
 ] as const) expect((await jsonFetch(path,{method:"PUT",body:JSON.stringify({tagIds})})).status).toBe(200);
 for(let i=0;i<5;i++) expect((await submit(key.token,{...article(crypto.randomUUID(),`2026-09-${20+i}`),markdown:i===4?"Not a match":"Literal %_ phrase 中文"})).status).toBe(201);
 expect((await jsonFetch(`/api/channels/${channel.id}/keys/${key.id}`,{method:"DELETE"})).status).toBe(200);
 const base = `/api/channels/${channel.id}/articles`;
 const filters = new URLSearchParams({date_from:"2026-09-21",date_to:"2026-09-24",q:"literal %_ PHRASE",tag_ids:`${tokenTag.id},${channelTag.id},${tokenTag.id}`,limit:"2"});
 const firstResponse = await jsonFetch(`${base}?${filters}`);
 expect(firstResponse.status).toBe(200);
 const first = dataOf<ArticlePage>(firstResponse.body);
 expect(first.items.map(x=>x.reportDate)).toEqual(["2026-09-23","2026-09-22"]);
 expect(first.nextCursor).toBe(first.items[1]?.id);
 filters.set("before",String(first.nextCursor));
 const next = dataOf<ArticlePage>((await jsonFetch(`${base}?${filters}`)).body);
 expect(next.items.map(x=>x.reportDate)).toEqual(["2026-09-21"]);
 expect(next.nextCursor).toBeNull();
 for(const query of [`tag_ids=${foreignTag.id}`,"q=literal%20%25X","date_to=2026-09-19"]) expect(dataOf<ArticlePage>((await jsonFetch(`${base}?${query}`)).body).items).toEqual([]);
 expect((await jsonFetch(`${base}?${filters}`,{headers:{"x-test-actor":"b"}})).status).toBe(404);
 const other = await createChannel();
 expect((await jsonFetch(`/api/channels/${other.id}/articles?before=${first.items[0]?.id}`)).status).toBe(400);
 for(const query of ["date_from=2026-02-30","date_from=2026-09-22&date_to=2026-09-21","tag_ids=1,,2","tag_ids=9007199254740992",`q=${"x".repeat(201)}`,`tag_ids=${Array.from({length:21},(_,i)=>i+1).join(",")}`]) expect((await jsonFetch(`${base}?${query}`)).status).toBe(400);
});

test("read markers persist across clients and bulk read covers every page without crossing tenants", async () => {
 const channel = await createChannel();
 const other = await createChannel();
 const key = await createKey(channel.id);
 const input = article();
 const first = await submit(key.token, input);
 const id = dataOf<ChannelArticle>(JSON.parse(first.text)).id;
 for(let i=0;i<32;i++) expect((await submit(key.token, article())).status).toBe(201);
 const read = await jsonFetch(`/api/channels/${channel.id}/articles/${id}/read`, { method: "PUT" });
 expect(read.status).toBe(200);
 expect(dataOf<ChannelArticle>((await jsonFetch(`/api/channels/${channel.id}/articles/${id}`)).body).isRead).toBe(true);
 expect((await submit(key.token,input)).status).toBe(200);
 expect(dataOf<ChannelArticle>((await jsonFetch(`/api/channels/${channel.id}/articles/${id}`)).body).isRead).toBe(true);
 expect((await listChannels()).find(c=>c.id===channel.id)?.hasUnread).toBe(true);
 for(const path of [`/api/channels/${channel.id}/articles/${id}/read`, `/api/channels/${channel.id}/articles/read`]) {
  expect((await jsonFetch(path,{method:"PUT",headers:{"x-test-actor":"b"}})).status).toBe(404);
  expect((await rawHttp(path,{method:"PUT",headers:ingestHeaders(key.token)})).status).toBe(404);
  expect((await jsonFetch(path,{method:"PUT",headers:{origin:"https://evil.example"}})).status).toBe(403);
 }
 expect((await jsonFetch(`/api/channels/${other.id}/articles/${id}/read`,{method:"PUT"})).status).toBe(404);
 const bulk = await jsonFetch(`/api/channels/${channel.id}/articles/read`, { method: "PUT" });
 expect(bulk.status).toBe(200);
 const page = dataOf<ArticlePage>((await jsonFetch(`/api/channels/${channel.id}/articles?limit=100`)).body);
 expect(page.items).toHaveLength(33);
 expect(page.items.every(a=>a.isRead)).toBe(true);
 expect((await listChannels()).find(c=>c.id===channel.id)?.hasUnread).toBe(false);
 expect((await submit(key.token,article())).status).toBe(201);
 expect((await listChannels()).find(c=>c.id===channel.id)?.hasUnread).toBe(true);
});
