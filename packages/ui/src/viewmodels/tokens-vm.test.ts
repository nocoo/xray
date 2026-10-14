import type { ManagedToken } from "@xray/shared";
import { expect, test, vi } from "vitest";
import { createTokensVm, filterTokens, tokenLabel } from "./tokens-vm";

const watchlist: ManagedToken = {
	id: 1,
	label: "Twitter producer",
	tokenPrefix: "prefix01",
	scopes: ["ingest:read", "ingest:push"],
	createdAtMs: 1,
	lastUsedAtMs: null,
	channelId: null,
	channelName: null,
	tags: [],
};
const channel: ManagedToken = {
	...watchlist,
	id: 2,
	label: "Daily agent",
	channelId: 3,
	channelName: "Research",
	scopes: ["articles:write"],
	tags: [{ id: 4, name: "Science" }],
};
function setup() {
	const api = {
		fetchTokens: vi.fn().mockResolvedValue([watchlist, channel]),
		createWatchlistToken: vi.fn().mockResolvedValue({ ...watchlist, id: 5, token: "watch-secret" }),
		createChannelKey: vi.fn().mockResolvedValue({ ...channel, id: 6, token: "channel-secret" }),
		renameWatchlistToken: vi.fn().mockResolvedValue({ updated: true }),
		renameChannelKey: vi.fn().mockResolvedValue({ updated: true }),
		revokeWatchlistToken: vi.fn().mockResolvedValue({ revoked: true }),
		revokeChannelKey: vi.fn().mockResolvedValue({ revoked: true }),
	};
	return { api, vm: createTokensVm(api) };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

test("filters both types and searches names, prefixes, channels and tags without mutating input", () => {
	const tokens = [watchlist, channel];
	expect(filterTokens(tokens, "", "all")).toEqual(tokens);
	expect(filterTokens(tokens, "", "watchlist")).toEqual([watchlist]);
	expect(filterTokens(tokens, "", "channel")).toEqual([channel]);
	for (const query of [" Daily ", "RESEARCH", "science"])
		expect(filterTokens(tokens, query, "all")).toEqual([channel]);
	expect(filterTokens(tokens, "prefix01", "all")).toEqual(tokens);
	expect(filterTokens(tokens, "absent", "all")).toEqual([]);
	expect(filterTokens(tokens, "Research", "watchlist")).toEqual([]);
});

test("loads all credentials and creates each type with isolated one-time secrets", async () => {
	const { api, vm } = setup();
	await vm.load();
	expect(vm.getState()).toMatchObject({ tokens: [watchlist, channel], loading: false });
	expect(await vm.create(" Watchlist ", null)).toBe(true);
	expect(api.createWatchlistToken).toHaveBeenCalledWith("Watchlist");
	expect(vm.getState().secret).toBe("watch-secret");
	expect(vm.getState().tokens[0]).toMatchObject({
		id: 5,
		channelId: null,
		scopes: watchlist.scopes,
	});
	expect(vm.getState().tokens[0]).not.toHaveProperty("token");
	vm.clearSecret();
	expect(vm.getState().secret).toBeNull();
	expect(await vm.create(" Channel ", { id: 3, name: "Research" })).toBe(true);
	expect(api.createChannelKey).toHaveBeenCalledWith(3, "Channel");
	expect(vm.getState().tokens[0]).toMatchObject({
		id: 6,
		channelId: 3,
		channelName: "Research",
		scopes: ["articles:write"],
		tags: [],
	});
	expect(vm.getState().secret).toBe("channel-secret");
});

test("renames, assigns tags and revokes through the appropriate APIs", async () => {
	const { api, vm } = setup();
	await vm.load();
	expect(await vm.rename(watchlist, " Renamed ")).toBe(true);
	expect(await vm.rename(channel, " Report ")).toBe(true);
	expect(api.renameWatchlistToken).toHaveBeenCalledWith(1, "Renamed");
	expect(api.renameChannelKey).toHaveBeenCalledWith(3, 2, "Report");
	vm.setTags(2, []);
	expect(vm.getState().tokens).toEqual([
		{ ...watchlist, label: "Renamed" },
		{ ...channel, label: "Report", tags: [] },
	]);
	expect(await vm.revoke(watchlist)).toBe(true);
	expect(api.revokeWatchlistToken).toHaveBeenCalledWith(1);
	expect(vm.getState().tokens.map((item) => item.id)).toEqual([2]);
	expect(await vm.revoke(channel)).toBe(true);
	expect(api.revokeChannelKey).toHaveBeenCalledWith(3, 2);
	expect(vm.getState().tokens).toEqual([]);
});

test("validates names and keeps metadata intact on failed actions", async () => {
	const { api, vm } = setup();
	await vm.load();
	for (const name of ["  ", "x".repeat(65)]) {
		expect(await vm.create(name, null)).toBeUndefined();
		expect(await vm.rename(channel, name)).toBeUndefined();
		expect(vm.getState().error).toContain("1 and 64");
	}
	expect(tokenLabel(` ${"x".repeat(64)} `)).toHaveLength(64);
	expect(api.createWatchlistToken).not.toHaveBeenCalled();
	api.revokeWatchlistToken.mockRejectedValueOnce("Unavailable");
	expect(await vm.revoke(watchlist)).toBeUndefined();
	expect(vm.getState()).toMatchObject({
		error: "Unavailable",
		tokens: [watchlist, channel],
		busy: false,
	});
	api.createChannelKey.mockRejectedValueOnce(new Error("Not found"));
	await vm.create("New", { id: 3, name: "Research" });
	expect(vm.getState()).toMatchObject({ error: "Not found", secret: null });
	api.fetchTokens.mockRejectedValueOnce(new Error("Offline"));
	await vm.load();
	expect(vm.getState()).toMatchObject({
		error: "Offline",
		loading: false,
		tokens: [watchlist, channel],
	});
});

test("ignores stale loads and blocks duplicate mutations or refresh during a write", async () => {
	const { api, vm } = setup();
	const old = deferred<ManagedToken[]>();
	api.fetchTokens.mockReturnValueOnce(old.promise);
	const loading = vm.load();
	await vm.load();
	old.resolve([]);
	await loading;
	expect(vm.getState().tokens).toEqual([watchlist, channel]);
	const pending = deferred<{ updated: true }>();
	api.renameWatchlistToken.mockReturnValueOnce(pending.promise);
	const saving = vm.rename(watchlist, "New");
	expect(await vm.revoke(channel)).toBeUndefined();
	await vm.load();
	expect(api.fetchTokens).toHaveBeenCalledTimes(2);
	pending.resolve({ updated: true });
	await saving;
	expect(vm.getState()).toMatchObject({ busy: false, error: null });
	expect(vm.getState().tokens[0]?.label).toBe("New");
});

test("mutations and tag edits invalidate in-flight catalogs including stale failures", async () => {
	const { api, vm } = setup();
	await vm.load();
	const old = deferred<ManagedToken[]>();
	api.fetchTokens.mockReturnValueOnce(old.promise);
	const loading = vm.load();
	vm.setTags(2, []);
	old.reject(new Error("Old error"));
	await loading;
	expect(vm.getState()).toMatchObject({ error: null, loading: false });
	const stale = deferred<ManagedToken[]>();
	api.fetchTokens.mockReturnValueOnce(stale.promise);
	const refreshing = vm.load();
	await vm.revoke(channel);
	stale.resolve([watchlist, channel]);
	await refreshing;
	expect(vm.getState().tokens).toEqual([watchlist]);
});
