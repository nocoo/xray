import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { decodeJwt } from "jose";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	type LocalRuntime,
	removeOwned,
	STATE_ROOT,
	startLocalRuntime,
	validateOwned,
} from "../../dev/local-runtime.js";

type Watchlist = { id: number; name: string };

async function request<T>(runtime: LocalRuntime, path: string, init: RequestInit = {}) {
	const response = await fetch(`${runtime.url}${path}`, {
		...init,
		signal: AbortSignal.timeout(15_000),
		headers: {
			"Cf-Access-Jwt-Assertion": runtime.jwtA,
			origin: runtime.url,
			"content-type": "application/json",
			...init.headers,
		},
	});
	return { status: response.status, body: (await response.json()) as T };
}

describe("L2 native environment isolation", () => {
	let left: LocalRuntime;
	let right: LocalRuntime;
	const runtimes: LocalRuntime[] = [];

	beforeAll(async () => {
		const results = await Promise.allSettled(
			[0, 1].map(async () => {
				const runtime = await startLocalRuntime("e2e");
				runtimes.push(runtime);
				return runtime;
			}),
		);
		const first = results[0];
		const second = results[1];
		if (first?.status !== "fulfilled" || second?.status !== "fulfilled") {
			throw new AggregateError(
				results.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])),
				"Concurrent E2E startup failed",
			);
		}
		left = first.value;
		right = second.value;
	}, 180_000);

	afterAll(async () => {
		const results = await Promise.allSettled(runtimes.map((runtime) => runtime.stop()));
		const errors = results.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : [],
		);
		if (errors.length) throw new AggregateError(errors, "Owned E2E cleanup failed");
		for (const runtime of runtimes) expect(existsSync(runtime.state.path)).toBe(false);
	}, 120_000);

	test("concurrent runtimes have fresh paths and distinct verified identities", async () => {
		expect(left.mode).toBe("e2e");
		expect(right.mode).toBe("e2e");
		expect(left.url).not.toBe(right.url);
		expect(left.instanceId).not.toBe(right.instanceId);
		expect(left.state.path).not.toBe(right.state.path);
		expect(left.state.owner.id).not.toBe(right.state.owner.id);
		for (const runtime of runtimes) {
			expect(dirname(runtime.state.path)).toBe(STATE_ROOT);
			await validateOwned(runtime.state);
			await runtime.verifyMarker();
			expect(existsSync(join(runtime.state.path, "d1"))).toBe(true);
		}
		const subjects = new Set<string | undefined>();
		const emails = new Set<string>();
		const userIds = new Set<string>();
		for (const runtime of runtimes) {
			for (const jwt of [runtime.jwtA, runtime.jwtB]) {
				const claims = decodeJwt(jwt);
				expect(claims.sub).toContain(runtime.instanceId);
				const me = await request<{
					authenticated: boolean;
					user: { id: string; email: string };
				}>(runtime, "/api/me", { headers: { "Cf-Access-Jwt-Assertion": jwt } });
				expect(me.status).toBe(200);
				expect(me.body.authenticated).toBe(true);
				expect(me.body.user.email).toBe(claims.email);
				subjects.add(claims.sub);
				emails.add(me.body.user.email);
				userIds.add(me.body.user.id);
			}
		}
		expect(subjects.size).toBe(4);
		expect(emails.size).toBe(4);
		expect(userIds.size).toBe(4);
	}, 30_000);

	test("real CRUD and underlying D1 rows stay inside their owning run", async () => {
		for (const runtime of runtimes) {
			const initial = await request<{ data: Watchlist[] }>(runtime, "/api/watchlists");
			expect(initial).toMatchObject({ status: 200, body: { data: [] } });
		}
		const created = await request<{ data: Watchlist }>(left, "/api/watchlists", {
			method: "POST",
			body: JSON.stringify({ name: `left-${left.instanceId}` }),
		});
		expect(created.status).toBe(201);
		const leftId = created.body.data.id;
		expect((await request(right, `/api/watchlists/${leftId}`)).status).toBe(404);
		expect((await right.sql("SELECT name FROM watchlists"))[0]?.results).toEqual([]);

		const other = await request<{ data: Watchlist }>(right, "/api/watchlists", {
			method: "POST",
			body: JSON.stringify({ name: `right-${right.instanceId}` }),
		});
		expect(other.status).toBe(201);
		const renamed = `updated-${left.instanceId}`;
		const updated = await request<{ data: Watchlist }>(left, `/api/watchlists/${leftId}`, {
			method: "PATCH",
			body: JSON.stringify({ name: renamed }),
		});
		expect(updated).toMatchObject({ status: 200, body: { data: { name: renamed } } });
		for (const [runtime, expected] of [
			[left, renamed],
			[right, other.body.data.name],
		] as const) {
			const listed = await request<{ data: Watchlist[] }>(runtime, "/api/watchlists");
			expect(listed.status).toBe(200);
			expect(listed.body.data.map((row) => row.name)).toEqual([expected]);
			expect((await runtime.sql("SELECT name FROM watchlists"))[0]?.results).toEqual([
				{ name: expected },
			]);
		}
		expect((await request(left, `/api/watchlists/${leftId}`, { method: "DELETE" })).status).toBe(
			200,
		);
		expect((await request(left, `/api/watchlists/${leftId}`)).status).toBe(404);
		expect((await left.sql("SELECT name FROM watchlists"))[0]?.results).toEqual([]);
		const surviving = await request<{ data: Watchlist }>(
			right,
			`/api/watchlists/${other.body.data.id}`,
		);
		expect(surviving).toMatchObject({ status: 200, body: { data: other.body.data } });
	}, 60_000);

	test("a signed JWT from either run is rejected by the other without creating users", async () => {
		for (const [target, source] of [
			[left, right],
			[right, left],
		] as const) {
			const before = (await target.sql("SELECT id,email,access_sub FROM users ORDER BY id"))[0]
				?.results;
			for (const jwt of [source.jwtA, source.jwtB]) {
				const result = await request(target, "/api/me", {
					headers: { "Cf-Access-Jwt-Assertion": jwt },
				});
				expect(result).toEqual({ status: 403, body: { error: "Invalid Access JWT" } });
			}
			expect(
				(await target.sql("SELECT id,email,access_sub FROM users ORDER BY id"))[0]?.results,
			).toEqual(before);
		}
	}, 60_000);

	test("active locks and stale ownership refuse removal without disturbing the runtime", async () => {
		const lock = join(right.state.path, "active.lock");
		const originalLock = await readFile(lock, "utf8");
		await expect(removeOwned(right.state)).rejects.toMatchObject({ code: "EEXIST" });
		const wrongOwner = { ...right.state, owner: { ...right.state.owner, id: randomUUID() } };
		await expect(validateOwned(wrongOwner)).rejects.toThrow("ownership mismatch");
		await expect(removeOwned(wrongOwner)).rejects.toThrow("ownership mismatch");
		expect(right.state.owner.initialized).toBe(true);
		expect(right.state.owner.fixtureVersion).toBeGreaterThan(0);
		for (const stale of [{ initialized: false }, { fixtureVersion: 0 }]) {
			const staleHandle = { ...right.state, owner: { ...right.state.owner, ...stale } };
			await expect(validateOwned(staleHandle)).rejects.toThrow("ownership mismatch");
			await expect(removeOwned(staleHandle)).rejects.toThrow("ownership mismatch");
		}
		expect(await readFile(lock, "utf8")).toBe(originalLock);
		await right.verifyMarker();
		expect((await request(right, "/api/me")).status).toBe(200);
	}, 30_000);

	test("foreign and symlinked paths are refused without modifying their contents", async () => {
		const foreign = await realpath(await mkdtemp(join(tmpdir(), "xray-l2-foreign-")));
		const alias = join(right.state.path, "foreign-link");
		try {
			await writeFile(join(foreign, "owner.json"), JSON.stringify(right.state.owner));
			await writeFile(join(foreign, "sentinel"), "preserve");
			await symlink(foreign, alias, "dir");
			for (const path of [foreign, alias]) {
				const state = { ...right.state, path };
				await expect(validateOwned(state)).rejects.toThrow("foreign environment path");
				await expect(removeOwned(state)).rejects.toThrow("foreign environment path");
			}
			expect(await readFile(join(foreign, "sentinel"), "utf8")).toBe("preserve");
			expect(existsSync(join(foreign, "active.lock"))).toBe(false);
		} finally {
			await rm(alias, { force: true });
			await rm(foreign, { recursive: true });
		}
	}, 15_000);

	test("marker mismatch blocks cleanup, then restoring ownership allows a retry", async () => {
		await left.sql("UPDATE _test_marker SET value='foreign-owner' WHERE key='owner'");
		try {
			await expect(left.verifyMarker()).rejects.toThrow("D1 ownership marker mismatch");
			await expect(left.stop()).rejects.toThrow("D1 ownership marker mismatch");
			expect(existsSync(left.state.path)).toBe(true);
			expect(existsSync(join(left.state.path, "d1"))).toBe(true);
			expect(existsSync(join(left.state.path, "active.lock"))).toBe(true);
			await right.verifyMarker();
			expect((await request(right, "/api/me")).status).toBe(200);
		} finally {
			if (existsSync(left.state.path)) {
				await left.sql(`UPDATE _test_marker SET value='${left.state.owner.id}' WHERE key='owner'`);
				await left.verifyMarker();
				await left.stop();
			}
		}
		expect(existsSync(left.state.path)).toBe(false);
		expect((await request(right, "/api/me")).status).toBe(200);
	}, 120_000);
});
