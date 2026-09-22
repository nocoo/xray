import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import app from "../index.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { AppEnv } from "../types.js";
import { deleteChannelArticleRoute, patchChannelArticleRoute } from "./channels.js";
import { deleteTagRoute, patchTagRoute, putChannelTagsRoute } from "./tags.js";

function setup() {
	const DB = createSqliteD1();
	const env = {
		DB,
		ENVIRONMENT: "test",
		AUTH_DEV_BYPASS: "true",
		ALLOWED_EMAILS: "dev@xray.local,dev-b@xray.local",
	} as AppEnv["Bindings"];
	async function call(path: string, method = "GET", body?: unknown, actor = "a", extra = {}) {
		const res = await app.request(
			path,
			{
				method,
				headers: {
					host: "127.0.0.1",
					origin: "http://localhost:7007",
					"content-type": "application/json",
					"x-test-actor": actor,
					...extra,
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			},
			env,
		);
		const json = (await res.json()) as { data: Record<string, unknown> };
		return { status: res.status, data: json.data };
	}
	return { DB, env, call };
}

describe("local tags and article management", () => {
	test("tenant scoped CRUD, atomic associations, and cascading tag deletion", async () => {
		const { call, DB } = setup();
		const ch = (await call("/api/channels", "POST", { name: "Reports" })).data;
		expect(ch.tags).toEqual([]);
		const key = (await call(`/api/channels/${ch.id}/keys`, "POST", { label: "Agent" })).data;
		expect(key.tags).toEqual([]);
		const tag = (await call("/api/tags", "POST", { name: " Alpha " })).data;
		const other = (await call("/api/tags", "POST", { name: "Other" }, "b")).data;
		const foreign = (await call("/api/channels", "POST", { name: "Foreign" }, "b")).data;
		expect((await call("/api/tags", "POST", { name: "Alpha" })).status).toBe(409);
		expect((await call("/api/tags", "POST", { name: "a".repeat(65) })).status).toBe(400);
		const second = (await call("/api/tags", "POST", { name: "Second" })).data;
		expect((await call(`/api/tags/${tag.id}`, "PATCH", { name: " Second " })).status).toBe(409);
		expect((await call(`/api/tags/${tag.id}`, "PATCH", { name: " Renamed " })).data).toEqual({
			id: tag.id,
			name: "Renamed",
		});
		for (const path of [
			`/api/channels/${ch.id}/tags`,
			`/api/channels/${ch.id}/keys/${key.id}/tags`,
		]) {
			expect((await call(path, "PUT", { tagIds: [tag.id] })).data).toEqual([
				{ id: tag.id, name: "Renamed" },
			]);
			for (const tagIds of [
				[other.id],
				[tag.id, other.id],
				[99999],
				[tag.id, tag.id],
				[0],
				[-1],
				[1.5],
				["1"],
				Array.from({ length: 21 }, (_, i) => i + 1),
				[Number.MAX_SAFE_INTEGER + 1],
			])
				expect((await call(path, "PUT", { tagIds })).status).toBe(400);
			for (const body of [null, [], {}, { tagIds: "x" }, { tagIds: [], extra: 1 }])
				expect((await call(path, "PUT", body)).status).toBe(400);
			expect((await call(path, "PUT", { tagIds: [] }, "b")).status).toBe(400);
		}
		expect(
			(await call(`/api/channels/${foreign.id}/keys/${key.id}/tags`, "PUT", { tagIds: [] })).status,
		).toBe(400);
		expect(
			(await call(`/api/channels/${ch.id}/keys/9999/tags`, "PUT", { tagIds: [] })).status,
		).toBe(400);
		expect((await call(`/api/channels/${ch.id}/keys/bad/tags`, "PUT", { tagIds: [] })).status).toBe(
			400,
		);
		const channels = (await call("/api/channels")).data as unknown as { tags: unknown[] }[];
		expect(channels[0]?.tags).toEqual([{ id: tag.id, name: "Renamed" }]);
		const keys = (await call(`/api/channels/${ch.id}/keys`)).data as unknown as {
			tags: unknown[];
		}[];
		expect(keys[0]?.tags).toEqual([{ id: tag.id, name: "Renamed" }]);
		expect((await call(`/api/tags/${tag.id}`, "DELETE", undefined, "b")).status).toBe(404);
		expect((await call(`/api/tags/${tag.id}`, "PATCH", { name: "Stolen" }, "b")).status).toBe(404);
		for (const body of [
			null,
			[],
			{ name: "x", color: "red" },
			{ name: "" },
			{ name: "x".repeat(65) },
		])
			expect((await call(`/api/tags/${tag.id}`, "PATCH", body)).status).toBe(400);
		expect((await call(`/api/tags/${tag.id}`, "DELETE")).data).toEqual({ deleted: true });
		for (const table of ["channel_tags", "channel_key_tags"])
			expect(await DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).toEqual({ n: 0 });
		expect((await call(`/api/channels/${ch.id}/keys`)).data).toHaveLength(1);
		expect((await call(`/api/channels/${ch.id}/tags`, "PUT", { tagIds: [second.id] })).status).toBe(
			200,
		);
		expect((await call(`/api/channels/${ch.id}/tags`, "PUT", { tagIds: [] })).data).toEqual([]);
		for (const method of ["PATCH", "DELETE"])
			expect((await call("/api/tags/bad", method, { name: "x" })).status).toBe(400);
		expect((await call("/api/channels/bad/tags", "PUT", { tagIds: [] })).status).toBe(400);
	});

	test("full article edits preserve identity, reject producer overwrites and allow recreate after delete", async () => {
		const { call, env } = setup();
		const ch = (await call("/api/channels", "POST", { name: "Reports" })).data;
		const key = (await call(`/api/channels/${ch.id}/keys`, "POST", { label: "Agent" })).data;
		const input = {
			external_id: "stable",
			title: "Original",
			report_date: "2026-09-22",
			markdown: "Body",
			summary: "Summary",
			author: "Author",
		};
		const submit = () =>
			app.request(
				"/api/v1/ingest/articles",
				{
					method: "POST",
					headers: {
						host: "xray-ingest.worker.hexly.ai",
						authorization: `Bearer ${key.token}`,
						"content-type": "application/json",
					},
					body: JSON.stringify(input),
				},
				env,
			);
		const created = await submit();
		expect(created.status).toBe(201);
		const { id } = (await created.json()) as { id: number };
		const path = `/api/channels/${ch.id}/articles/${id}`;
		const patch = { title: "Edited", report_date: "2026-09-21", markdown: "Changed" };
		expect((await call(path, "PATCH", patch, "b")).status).toBe(404);
		expect((await call(path, "DELETE", undefined, "b")).status).toBe(404);
		for (const body of [
			null,
			[],
			{ ...patch, external_id: "hack" },
			{ ...patch, source_label: "hack" },
			{ ...patch, id: 3 },
			{ ...patch, user_id: "hack" },
			{},
			{ ...patch, report_date: "2026-02-30" },
		])
			expect((await call(path, "PATCH", body)).status).toBe(400);
		expect((await call(path, "PATCH", { ...patch, markdown: "x".repeat(524289) })).status).toBe(
			413,
		);
		expect((await call(path, "PATCH", { ...patch, markdown: "x".repeat(1048577) })).status).toBe(
			413,
		);
		const edited = (await call(path, "PATCH", patch)).data;
		expect(edited).toMatchObject({
			id,
			externalId: "stable",
			title: "Edited",
			markdown: "Changed",
			summary: null,
			author: null,
			sourceLabel: "Agent",
		});
		expect((await submit()).status).toBe(409);
		expect((await call(path)).data).toEqual(edited);
		for (const [method, p] of [
			["PATCH", path],
			["DELETE", path],
			["PATCH", "/api/tags/1"],
			["DELETE", "/api/tags/1"],
			["PUT", `/api/channels/${ch.id}/tags`],
			["PUT", `/api/channels/${ch.id}/keys/${key.id}/tags`],
		]) {
			expect(
				(
					await call(p as string, method, patch, "a", {
						host: "xray-ingest.worker.hexly.ai",
						authorization: `Bearer ${key.token}`,
					})
				).status,
			).toBe(404);
			const prod = {
				...env,
				ENVIRONMENT: "production",
				AUTH_DEV_BYPASS: undefined,
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUD: "test",
			};
			expect(
				(
					await app.request(
						p as string,
						{ method, headers: { host: "xray.hexly.ai", authorization: `Bearer ${key.token}` } },
						prod,
					)
				).status,
			).toBe(401);
		}
		expect((await call(path, "DELETE")).data).toEqual({ deleted: true });
		expect((await call(path, "DELETE")).status).toBe(404);
		expect((await call(path, "PATCH", patch)).status).toBe(404);
		expect((await submit()).status).toBe(201);
		for (const method of ["PATCH", "DELETE"]) {
			expect((await call("/api/channels/bad/articles/1", method, patch)).status).toBe(400);
			expect((await call("/api/channels/1/articles/bad", method, patch)).status).toBe(400);
		}
		expect(
			(
				await app.request(
					path,
					{
						method: "PATCH",
						headers: { host: "127.0.0.1", origin: "http://localhost:7007" },
						body: "{bad",
					},
					env,
				)
			).status,
		).toBe(400);
	});

	test("route handlers reject missing identity", async () => {
		const h = new Hono<AppEnv>();
		h.patch("/tags/:id", patchTagRoute);
		h.delete("/tags/:id", deleteTagRoute);
		h.put("/channels/:id/tags", putChannelTagsRoute);
		h.patch("/channels/:id/articles/:articleId", patchChannelArticleRoute);
		h.delete("/channels/:id/articles/:articleId", deleteChannelArticleRoute);
		for (const [method, path] of [
			["PATCH", "/tags/1"],
			["DELETE", "/tags/1"],
			["PUT", "/channels/1/tags"],
			["PATCH", "/channels/1/articles/1"],
			["DELETE", "/channels/1/articles/1"],
		])
			expect((await h.request(path as string, { method })).status).toBe(401);
	});
});
