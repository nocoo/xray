import type {
	ArticleInput,
	Channel,
	ChannelArticle,
	ChannelKey,
	ManagedToken,
	Tag,
} from "@xray/shared";
import { describe, expect, test } from "vitest";
import { actorHeaders, dataOf, ingestHeaders, jsonFetch, rawHttp } from "./helpers.js";

async function credentials(actor: "a" | "b" = "a") {
	const headers = actorHeaders(actor);
	const channelResponse = await jsonFetch("/api/channels", {
		method: "POST",
		headers,
		body: JSON.stringify({ name: `Tokens ${crypto.randomUUID()}` }),
	});
	expect(channelResponse.status).toBe(201);
	const channel = dataOf<Channel>(channelResponse.body);
	const watchResponse = await jsonFetch("/api/push-tokens", {
		method: "POST",
		headers,
		body: JSON.stringify({ label: "Watchlist producer" }),
	});
	expect(watchResponse.status).toBe(201);
	const watch = dataOf<{ id: number; token: string }>(watchResponse.body);
	const keyResponse = await jsonFetch(`/api/channels/${channel.id}/keys`, {
		method: "POST",
		headers,
		body: JSON.stringify({ label: "Original producer" }),
	});
	expect(keyResponse.status).toBe(201);
	const key = dataOf<ChannelKey & { token: string }>(keyResponse.body);
	return { channel, watch, key };
}

async function catalog(actor: "a" | "b" = "a") {
	const response = await jsonFetch("/api/tokens", { headers: actorHeaders(actor) });
	expect(response.status).toBe(200);
	return dataOf<ManagedToken[]>(response.body);
}

function submit(token: string, input: ArticleInput) {
	return rawHttp("/api/v1/ingest/articles", {
		method: "POST",
		headers: ingestHeaders(token),
		body: JSON.stringify(input),
	});
}

describe("token management over real HTTP", () => {
	test("lists tenant metadata and renames without rotating credentials or changing report snapshots", async () => {
		const { channel, watch, key } = await credentials();
		const foreign = await credentials("b");
		const tagResponse = await jsonFetch("/api/tags", {
			method: "POST",
			body: JSON.stringify({ name: `Token tag ${crypto.randomUUID()}` }),
		});
		expect(tagResponse.status).toBe(201);
		const tag = dataOf<Tag>(tagResponse.body);
		expect(
			(
				await jsonFetch(`/api/channels/${channel.id}/keys/${key.id}/tags`, {
					method: "PUT",
					body: JSON.stringify({ tagIds: [tag.id] }),
				})
			).status,
		).toBe(200);
		const input: ArticleInput = {
			external_id: crypto.randomUUID(),
			title: "Token rename",
			report_date: "2026-10-14",
			markdown: "## Immutable report",
			summary: "Snapshot",
			author: "Research team",
		};
		const submitted = await submit(key.token, input);
		expect(submitted.status).toBe(201);
		const article = JSON.parse(submitted.text) as { id: number; duplicate: boolean };
		const snapshot = dataOf<ChannelArticle>(
			(await jsonFetch(`/api/channels/${channel.id}/articles/${article.id}`)).body,
		);
		expect(snapshot.sourceLabel).toBe("Original producer");
		const before = await catalog();
		expect(before).toContainEqual(
			expect.objectContaining({
				id: watch.id,
				channelId: null,
				tags: [],
				scopes: ["ingest:read", "ingest:push"],
			}),
		);
		expect(before).toContainEqual(
			expect.objectContaining({
				id: key.id,
				channelId: channel.id,
				channelName: channel.name,
				tags: [{ id: tag.id, name: tag.name }],
				scopes: ["articles:write"],
			}),
		);
		expect(before.map((token) => token.id)).not.toContain(foreign.watch.id);
		expect(before.map((token) => token.id)).not.toContain(foreign.key.id);
		const foreignBefore = await catalog("b");
		expect(foreignBefore.map((token) => token.id)).not.toContain(watch.id);
		expect(foreignBefore.map((token) => token.id)).not.toContain(key.id);
		for (const secret of [watch.token, key.token, foreign.watch.token, foreign.key.token]) {
			const hash = Buffer.from(
				await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
			).toString("hex");
			expect(JSON.stringify(before)).not.toContain(secret);
			expect(JSON.stringify(before)).not.toContain(hash);
		}
		const watchRename = await jsonFetch(`/api/push-tokens/${watch.id}`, {
			method: "PATCH",
			body: JSON.stringify({
				label: "  Renamed watchlist  ",
				scopes: ["articles:write"],
				channel_id: foreign.channel.id,
			}),
		});
		expect(watchRename.status).toBe(200);
		expect(dataOf(watchRename.body)).toEqual({ updated: true });
		const keyRename = await jsonFetch(`/api/channels/${channel.id}/keys/${key.id}`, {
			method: "PATCH",
			body: JSON.stringify({
				label: "Renamed producer",
				scopes: ["ingest:push"],
				channel_id: foreign.channel.id,
			}),
		});
		expect(keyRename.status).toBe(200);
		expect(dataOf(keyRename.body)).toEqual({ updated: true });
		expect(await catalog()).toEqual(
			before.map((token) => ({
				...token,
				label:
					token.id === watch.id
						? "Renamed watchlist"
						: token.id === key.id
							? "Renamed producer"
							: token.label,
			})),
		);
		expect(await catalog("b")).toEqual(foreignBefore);
		const keys = dataOf<ChannelKey[]>((await jsonFetch(`/api/channels/${channel.id}/keys`)).body);
		expect(keys.find((item) => item.id === key.id)?.label).toBe("Renamed producer");
		const retry = await submit(key.token, input);
		expect(retry.status).toBe(200);
		expect(JSON.parse(retry.text)).toMatchObject({
			id: article.id,
			channelId: channel.id,
			duplicate: true,
		});
		expect(
			dataOf((await jsonFetch(`/api/channels/${channel.id}/articles/${article.id}`)).body),
		).toEqual(snapshot);
		expect((await submit(key.token, { ...input, markdown: "Changed content" })).status).toBe(409);
		const next = await submit(key.token, { ...input, external_id: crypto.randomUUID() });
		expect(next.status).toBe(201);
		const nextArticle = JSON.parse(next.text) as { id: number; duplicate: boolean };
		expect(nextArticle.id).not.toBe(article.id);
		expect(nextArticle.duplicate).toBe(false);
		expect(
			dataOf<ChannelArticle>(
				(await jsonFetch(`/api/channels/${channel.id}/articles/${nextArticle.id}`)).body,
			).sourceLabel,
		).toBe("Renamed producer");
		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(watch.token) })).status,
		).toBe(200);
		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(key.token) })).status,
		).toBe(403);
		expect((await submit(watch.token, input)).status).toBe(403);
	});

	test("rejects foreign, wrong-kind, wrong-channel, invalid and revoked token renames", async () => {
		const { channel, watch, key } = await credentials();
		const other = await credentials();
		const paths = [`/api/push-tokens/${watch.id}`, `/api/channels/${channel.id}/keys/${key.id}`];
		const before = await catalog();
		for (const path of paths) {
			expect(
				(
					await jsonFetch(path, {
						method: "PATCH",
						headers: actorHeaders("b"),
						body: JSON.stringify({ label: "Hijack" }),
					})
				).status,
			).toBe(404);
			for (const body of [
				"{",
				"null",
				"[]",
				"{}",
				'{"label":1}',
				'{"label":"   "}',
				JSON.stringify({ label: "x".repeat(65) }),
			]) {
				expect((await jsonFetch(path, { method: "PATCH", body })).status, body).toBe(400);
			}
		}
		for (const path of [
			`/api/push-tokens/${key.id}`,
			`/api/channels/${channel.id}/keys/${watch.id}`,
			`/api/channels/${other.channel.id}/keys/${key.id}`,
		]) {
			expect(
				(
					await jsonFetch(path, {
						method: "PATCH",
						body: JSON.stringify({ label: "Wrong binding" }),
					})
				).status,
			).toBe(404);
		}
		for (const path of ["/api/push-tokens/0", `/api/channels/${channel.id}/keys/0`]) {
			expect(
				(await jsonFetch(path, { method: "PATCH", body: JSON.stringify({ label: "Invalid ID" }) }))
					.status,
			).toBe(400);
		}
		expect(await catalog()).toEqual(before);
		for (const path of paths) {
			expect((await jsonFetch(path, { method: "DELETE" })).status).toBe(200);
			expect(
				(await jsonFetch(path, { method: "PATCH", body: JSON.stringify({ label: "Revoked" }) }))
					.status,
			).toBe(404);
		}
		expect(await catalog()).toEqual(
			before.filter((token) => token.id !== watch.id && token.id !== key.id),
		);
		expect(dataOf((await jsonFetch(`/api/channels/${channel.id}/keys`)).body)).toEqual([]);
		expect(
			(await rawHttp("/api/v1/ingest/graph", { headers: ingestHeaders(watch.token) })).status,
		).toBe(401);
		expect(
			(
				await rawHttp("/api/v1/ingest/articles", {
					method: "POST",
					headers: ingestHeaders(key.token),
					body: "{}",
				})
			).status,
		).toBe(401);
	});

	test("requires browser Access and same-origin mutations, never Bearer administration", async () => {
		const { channel, watch, key } = await credentials();
		const before = await catalog();
		for (const [method, path] of [
			["GET", "/api/tokens"],
			["PATCH", `/api/push-tokens/${watch.id}`],
			["PATCH", `/api/channels/${channel.id}/keys/${key.id}`],
		] as const) {
			const body = method === "GET" ? undefined : JSON.stringify({ label: "Unauthorized" });
			for (const host of ["xray-ingest.worker.hexly.ai", "unknown.example"]) {
				expect(
					(await rawHttp(path, { method, body, headers: actorHeaders("a", { host }) })).status,
				).toBe(404);
			}
			for (const token of [watch.token, key.token]) {
				expect((await rawHttp(path, { method, body, headers: ingestHeaders(token) })).status).toBe(
					404,
				);
				expect(
					(
						await rawHttp(path, {
							method,
							body,
							headers: ingestHeaders(token, {
								host: "xray.hexly.ai",
								origin: "https://xray.hexly.ai",
							}),
						})
					).status,
				).toBe(401);
			}
			expect(
				(
					await rawHttp(path, {
						method,
						body,
						headers: { host: "xray.hexly.ai", origin: "https://xray.hexly.ai" },
					})
				).status,
			).toBe(401);
			if (method === "PATCH") {
				expect(
					(
						await rawHttp(path, {
							method,
							body,
							headers: actorHeaders("a", { host: "xray.hexly.ai", origin: "https://evil.example" }),
						})
					).status,
				).toBe(403);
			}
		}
		expect(await catalog()).toEqual(before);
	});
});
