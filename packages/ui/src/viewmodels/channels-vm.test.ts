import type { Channel, ChannelArticle, ChannelKey } from "@xray/shared";
import { describe, expect, test, vi } from "vitest";
import { createChannelsVm } from "./channels-vm";

const channel: Channel = {
	id: 1,
	name: "Research",
	description: null,
	createdAtMs: 1,
	articleCount: 2,
};
const article: ChannelArticle = {
	id: 2,
	channelId: 1,
	externalId: "daily",
	title: "Daily",
	reportDate: "2026-09-22",
	summary: null,
	author: null,
	sourceLabel: "Agent",
	createdAtMs: 1,
	markdown: "## Hello",
};
const key: ChannelKey = {
	id: 3,
	channelId: 1,
	label: "Agent",
	tokenPrefix: "prefix",
	createdAtMs: 1,
	lastUsedAtMs: null,
};
function setup() {
	const api = {
		fetchChannels: vi.fn().mockResolvedValue([channel]),
		createChannel: vi.fn().mockResolvedValue(channel),
		renameChannel: vi.fn().mockResolvedValue({ ...channel, name: "New" }),
		fetchArticles: vi.fn().mockResolvedValue({ items: [article], nextCursor: 2 }),
		fetchArticle: vi.fn().mockResolvedValue(article),
		fetchChannelKeys: vi.fn().mockResolvedValue([key]),
		createChannelKey: vi.fn().mockResolvedValue({ ...key, id: 4, token: "one-time" }),
		revokeChannelKey: vi.fn().mockResolvedValue({ revoked: true }),
	};
	return { api, vm: createChannelsVm(api) };
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("channels VM", () => {
	test("loads catalogs, creates and renames without losing unrelated channels", async () => {
		const { vm, api } = setup();
		await vm.loadChannels();
		expect(vm.getState().channels).toEqual([channel]);
		await vm.create(" New ");
		expect(api.createChannel).toHaveBeenCalledWith("New");
		vm.setState({ channels: [channel, { ...channel, id: 9 }] });
		await vm.rename(1, " New ");
		expect(api.renameChannel).toHaveBeenCalledWith(1, "New");
		expect(vm.getState().channels.map((c) => c.name)).toEqual(["New", "Research"]);
		api.fetchChannels.mockRejectedValue(Error("catalog"));
		await vm.loadChannels();
		expect(vm.getState().error).toBe("catalog");
		api.createChannel.mockRejectedValue(Error("create"));
		expect(await vm.create("bad")).toBeUndefined();
		expect(vm.getState()).toMatchObject({ busy: false, error: "create" });
	});
	test("date changes reset lists, pagination appends once and guards loading/end", async () => {
		const { vm, api } = setup();
		await vm.loadArticles(1, "");
		api.fetchArticles.mockResolvedValue({
			items: [article, { ...article, id: 1 }],
			nextCursor: null,
		});
		await vm.loadArticles(1, "", true);
		expect(api.fetchArticles).toHaveBeenLastCalledWith(1, "", 2);
		expect(vm.getState().items.map((a) => a.id)).toEqual([2, 1]);
		await vm.loadArticles(1, "", true);
		expect(api.fetchArticles).toHaveBeenCalledTimes(2);
		vm.setState({ loading: true, nextCursor: 1 });
		await vm.loadArticles(1, "", true);
		expect(api.fetchArticles).toHaveBeenCalledTimes(2);
		await vm.loadArticles(1, "2026-09-22");
		expect(api.fetchArticles).toHaveBeenLastCalledWith(1, "2026-09-22", null);
		await vm.loadArticles(0, "");
		expect(vm.getState()).toMatchObject({ items: [], loading: false, nextCursor: null });
	});
	test("late list success/failure cannot replace newer date or channel", async () => {
		const { vm, api } = setup();
		const slow = deferred<{ items: ChannelArticle[]; nextCursor: null }>();
		api.fetchArticles.mockReturnValueOnce(slow.promise);
		const first = vm.loadArticles(1, "old");
		await vm.loadArticles(2, "new");
		slow.resolve({ items: [], nextCursor: null });
		await first;
		expect(vm.getState()).toMatchObject({ channelId: 2, date: "new", items: [article] });
		const failure = deferred<never>();
		api.fetchArticles.mockReturnValueOnce(failure.promise);
		const old = vm.loadArticles(1, "old");
		await vm.loadArticles(2, "new");
		failure.reject(Error("stale"));
		await old;
		expect(vm.getState().error).toBeNull();
		api.fetchArticles.mockRejectedValue(Error("list"));
		await vm.loadArticles(2, "new");
		expect(vm.getState()).toMatchObject({ loading: false, error: "list", items: [article] });
	});
	test("navigation guards detail responses and retains readable article on errors/loading", async () => {
		const { vm, api } = setup();
		await vm.selectArticle(1, 2);
		const slow = deferred<ChannelArticle>();
		api.fetchArticle.mockReturnValueOnce(slow.promise);
		const old = vm.selectArticle(1, 3);
		expect(vm.getState()).toMatchObject({ article, articleLoading: true });
		await vm.selectArticle(1, 4);
		slow.resolve({ ...article, id: 3 });
		await old;
		expect(vm.getState().article).toEqual(article);
		const failure = deferred<never>();
		api.fetchArticle.mockReturnValueOnce(failure.promise);
		const late = vm.selectArticle(1, 5);
		await vm.selectArticle(1, 4);
		failure.reject(Error("stale"));
		await late;
		expect(vm.getState().error).toBeNull();
		api.fetchArticle.mockRejectedValue(Error("missing"));
		await vm.selectArticle(1, 6);
		expect(vm.getState()).toMatchObject({ article, articleLoading: false, error: "missing" });
		await vm.selectArticle(0, 0);
		expect(vm.getState()).toMatchObject({ article: null, articleLoading: false });
	});
	test("keys are active metadata only; plaintext disappears on close and revocation", async () => {
		const { vm, api } = setup();
		await vm.manage(1);
		expect(vm.getState().keys).toEqual([key]);
		await vm.createKey(" Agent ");
		expect(api.createChannelKey).toHaveBeenCalledWith(1, "Agent");
		expect(vm.getState().token).toBe("one-time");
		expect(vm.getState().keys[1]).not.toHaveProperty("token");
		await vm.revoke(3);
		expect(vm.getState().keys.map((k) => k.id)).toEqual([4]);
		expect(vm.getState().token).toBeNull();
		await vm.manage(0);
		expect(vm.getState()).toMatchObject({ keys: [], token: null, managerId: 0 });
		api.fetchChannelKeys.mockRejectedValue(Error("keys"));
		await vm.manage(1);
		expect(vm.getState().error).toBe("keys");
	});
	test("closing a dialog invalidates key list, create and revoke responses, and serializes mutations", async () => {
		const { vm, api } = setup();
		const slow = deferred<ChannelKey[]>();
		api.fetchChannelKeys.mockReturnValueOnce(slow.promise);
		const opening = vm.manage(1);
		await vm.manage(0);
		slow.resolve([key]);
		await opening;
		expect(vm.getState().keys).toEqual([]);
		const failure = deferred<never>();
		api.fetchChannelKeys.mockReturnValueOnce(failure.promise);
		const failed = vm.manage(1);
		await vm.manage(0);
		failure.reject(Error("late"));
		await failed;
		expect(vm.getState().error).toBeNull();
		await vm.manage(1);
		const issue = deferred<ChannelKey & { token: string }>();
		api.createChannelKey.mockReturnValueOnce(issue.promise);
		const creating = vm.createKey("Agent");
		expect(await vm.create("duplicate")).toBeUndefined();
		expect(api.createChannel).not.toHaveBeenCalled();
		await vm.manage(0);
		issue.resolve({ ...key, token: "secret" });
		await creating;
		expect(vm.getState().token).toBeNull();
		await vm.manage(1);
		const revoke = deferred<{ revoked: true }>();
		api.revokeChannelKey.mockReturnValueOnce(revoke.promise);
		const revoking = vm.revoke(3);
		await vm.manage(0);
		revoke.resolve({ revoked: true });
		await revoking;
		expect(vm.getState().keys).toEqual([]);
	});
});

test("catalog loads cannot erase newly created/renamed channels, or surface stale errors", async () => {
	const { vm, api } = setup();
	const slow = deferred<Channel[]>();
	api.fetchChannels.mockReturnValueOnce(slow.promise);
	const loading = vm.loadChannels();
	await vm.create("Research");
	slow.resolve([]);
	await loading;
	expect(vm.getState().channels).toEqual([channel]);
	const failed = deferred<never>();
	api.fetchChannels.mockReturnValueOnce(failed.promise);
	const old = vm.loadChannels();
	await vm.rename(1, "New");
	failed.reject(Error("stale"));
	await old;
	expect(vm.getState()).toMatchObject({ error: null, channels: [{ ...channel, name: "New" }] });
});

test("reload restores loaded pages, bounded to 50, and cancels rehydration on navigation", async () => {
	const { vm, api } = setup();
	api.fetchArticles
		.mockResolvedValueOnce({ items: [article], nextCursor: 2 })
		.mockResolvedValueOnce({ items: [{ ...article, id: 1 }], nextCursor: null });
	await vm.loadArticles(1, "", false, 4);
	expect(vm.getState()).toMatchObject({ pageCount: 2, nextCursor: null });
	expect(vm.getState().items.map((a) => a.id)).toEqual([2, 1]);
	api.fetchArticles.mockClear();
	await vm.loadArticles(1, "", false, 1000);
	expect(api.fetchArticles).toHaveBeenCalledTimes(50);
	const slow = deferred<{ items: ChannelArticle[]; nextCursor: null }>();
	api.fetchArticles
		.mockResolvedValueOnce({ items: [article], nextCursor: 2 })
		.mockReturnValueOnce(slow.promise);
	const old = vm.loadArticles(1, "", false, 2);
	await Promise.resolve();
	await vm.loadArticles(0, "");
	slow.resolve({ items: [article], nextCursor: null });
	await old;
	expect(vm.getState()).toMatchObject({ items: [], pageCount: 0 });
});
