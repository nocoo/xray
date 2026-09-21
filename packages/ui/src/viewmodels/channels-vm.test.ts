import type { Channel, ChannelArticle, ChannelKey } from "@xray/shared";
import { describe, expect, test, vi } from "vitest";
import { createChannelsVm } from "./channels-vm";

const channel: Channel = {
	id: 1,
	name: "Research",
	description: null,
	createdAtMs: 1,
	articleCount: 2,
	sortOrder: 0,
	activeKeyCount: 1,
	latestReportDate: "2026-09-22",
	lastReceivedAtMs: 1,
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
		updateChannel: vi.fn().mockResolvedValue({ ...channel, name: "New" }),
		deleteChannel: vi.fn().mockResolvedValue({ deleted: true }),
		reorderChannels: vi.fn().mockResolvedValue([channel]),
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
	test("loads catalogs, creates and updates without losing unrelated channels", async () => {
		const { vm, api } = setup();
		await vm.loadChannels();
		expect(vm.getState().channels).toEqual([channel]);
		await vm.create(" New ", " Description ");
		expect(api.createChannel).toHaveBeenCalledWith("New", "Description");
		vm.setState({ channels: [channel, { ...channel, id: 9 }] });
		await vm.update(1, " New ", " Updated ");
		expect(api.updateChannel).toHaveBeenCalledWith(1, "New", "Updated");
		expect(vm.getState().channels.map((c) => c.name)).toEqual(["New", "Research"]);
		api.fetchChannels.mockRejectedValue(Error("catalog"));
		await vm.loadChannels();
		expect(vm.getState().error).toBe("catalog");
		api.createChannel.mockRejectedValue(Error("create"));
		expect(await vm.create("bad", "")).toBeUndefined();
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
	test("leaving settings invalidates key list, create and revoke responses, and serializes mutations", async () => {
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
		expect(await vm.create("duplicate", "")).toBeUndefined();
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

test("catalog loads cannot erase newly created/updated channels, or surface stale errors", async () => {
	const { vm, api } = setup();
	const slow = deferred<Channel[]>();
	api.fetchChannels.mockReturnValueOnce(slow.promise);
	const loading = vm.loadChannels();
	await vm.create("Research", "");
	slow.resolve([]);
	await loading;
	expect(vm.getState().channels).toEqual([channel]);
	const failed = deferred<never>();
	api.fetchChannels.mockReturnValueOnce(failed.promise);
	const old = vm.loadChannels();
	await vm.update(1, "New", "");
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

test.each(["create", "update", "remove", "move"] as const)(
	"failed %s leaves an in-flight catalog able to finish",
	async (operation) => {
		const { vm, api } = setup();
		const other = { ...channel, id: 9 };
		vm.setState({ channels: [channel, other] });
		const catalog = deferred<Channel[]>();
		api.fetchChannels.mockReturnValueOnce(catalog.promise);
		const loading = vm.loadChannels();
		expect(vm.getState().catalogLoading).toBe(true);
		const failure = Error("mutation failed");
		api.createChannel.mockRejectedValue(failure);
		api.updateChannel.mockRejectedValue(failure);
		api.deleteChannel.mockRejectedValue(failure);
		api.reorderChannels.mockRejectedValue(failure);
		if (operation === "create") await vm.create("New", "Description");
		if (operation === "update") await vm.update(1, "New", "Description");
		if (operation === "remove") await vm.remove(1);
		if (operation === "move") await vm.move(1, 1);
		expect(vm.getState()).toMatchObject({
			busy: false,
			error: "mutation failed",
			catalogLoading: true,
		});
		catalog.resolve([channel, other]);
		await loading;
		expect(vm.getState()).toMatchObject({
			channels: [channel, other],
			catalogLoading: false,
			error: "mutation failed",
		});
	},
);

test("catalog requests keep loading until the newest request finishes, including failures", async () => {
	const { vm, api } = setup();
	const old = deferred<Channel[]>();
	const latest = deferred<Channel[]>();
	api.fetchChannels.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
	const first = vm.loadChannels();
	const second = vm.loadChannels();
	old.resolve([]);
	await first;
	expect(vm.getState().catalogLoading).toBe(true);
	latest.reject(Error("catalog failed"));
	await second;
	expect(vm.getState()).toMatchObject({ catalogLoading: false, error: "catalog failed" });
});

test("a catalog that includes an in-flight creation cannot duplicate the new channel", async () => {
	const { vm, api } = setup();
	const creation = deferred<Channel>();
	api.createChannel.mockReturnValueOnce(creation.promise);
	const creating = vm.create("Research", "");
	await vm.loadChannels();
	creation.resolve(channel);
	await creating;
	expect(vm.getState()).toMatchObject({ channels: [channel], catalogLoading: false, busy: false });
});

test("moves adjacent channels using server order, guards boundaries and preserves serialization", async () => {
	const { vm, api } = setup();
	const other = { ...channel, id: 9, sortOrder: 1 };
	vm.setState({ channels: [channel, other] });
	await vm.move(99, 1);
	await vm.move(1, -1);
	await vm.move(9, 1);
	expect(api.reorderChannels).not.toHaveBeenCalled();
	const catalog = deferred<Channel[]>();
	const ordering = deferred<Channel[]>();
	api.fetchChannels.mockReturnValueOnce(catalog.promise);
	api.reorderChannels.mockReturnValueOnce(ordering.promise);
	const loading = vm.loadChannels();
	const moving = vm.move(9, -1);
	await vm.remove(1);
	expect(api.deleteChannel).not.toHaveBeenCalled();
	expect(api.reorderChannels).toHaveBeenCalledWith([9, 1]);
	const ordered = [
		{ ...other, sortOrder: 0 },
		{ ...channel, sortOrder: 1 },
	];
	ordering.resolve(ordered);
	await moving;
	catalog.resolve([channel, other]);
	await loading;
	expect(vm.getState()).toMatchObject({ channels: ordered, catalogLoading: false, busy: false });
	api.reorderChannels.mockResolvedValue([channel, other]);
	await vm.move(9, 1);
	expect(api.reorderChannels).toHaveBeenLastCalledWith([1, 9]);
});

test("deletion clears matching reader and manager state and invalidates all their pending responses", async () => {
	const { vm, api } = setup();
	const other = { ...channel, id: 9 };
	vm.setState({ channels: [channel, other], token: "secret" });
	const catalog = deferred<Channel[]>();
	const list = deferred<{ items: ChannelArticle[]; nextCursor: null }>();
	const detail = deferred<ChannelArticle>();
	const keys = deferred<ChannelKey[]>();
	api.fetchChannels.mockReturnValueOnce(catalog.promise);
	api.fetchArticles.mockReturnValueOnce(list.promise);
	api.fetchArticle.mockReturnValueOnce(detail.promise);
	api.fetchChannelKeys.mockReturnValueOnce(keys.promise);
	const requests = [
		vm.loadChannels(),
		vm.loadArticles(1, "today"),
		vm.selectArticle(1, 2),
		vm.manage(1),
	];
	expect(await vm.remove(1)).toBe(true);
	expect(api.deleteChannel).toHaveBeenCalledWith(1);
	catalog.resolve([channel, other]);
	list.resolve({ items: [article], nextCursor: null });
	detail.resolve(article);
	keys.resolve([key]);
	await Promise.all(requests);
	expect(vm.getState()).toMatchObject({
		channels: [other],
		catalogLoading: false,
		channelId: 0,
		date: "",
		items: [],
		pageCount: 0,
		nextCursor: null,
		loading: false,
		article: null,
		articleLoading: false,
		managerId: 0,
		keys: [],
		token: null,
		keysLoading: false,
		busy: false,
	});
});

test("deleting an unrelated channel preserves the active reader and manager", async () => {
	const { vm } = setup();
	await vm.loadArticles(1, "today");
	await vm.selectArticle(1, 2);
	await vm.manage(1);
	await vm.remove(9);
	expect(vm.getState()).toMatchObject({
		channelId: 1,
		date: "today",
		items: [article],
		article,
		managerId: 1,
		keys: [key],
	});
});

test("deletion clears retained old content while preserving a new channel's pending detail", async () => {
	const { vm, api } = setup();
	await vm.selectArticle(1, 2);
	const detail = deferred<ChannelArticle>();
	api.fetchArticle.mockReturnValueOnce(detail.promise);
	const selecting = vm.selectArticle(9, 5);
	await vm.remove(1);
	expect(vm.getState()).toMatchObject({ article: null, articleLoading: true });
	const next = { ...article, channelId: 9, id: 5 };
	detail.resolve(next);
	await selecting;
	expect(vm.getState()).toMatchObject({ article: next, articleLoading: false });
});

test("key mutations wait for a valid loaded manager, and latest key requests own loading", async () => {
	const { vm, api } = setup();
	await vm.createKey("Agent");
	await vm.revoke(3);
	const old = deferred<ChannelKey[]>();
	const latest = deferred<ChannelKey[]>();
	api.fetchChannelKeys.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
	const first = vm.manage(1);
	await vm.createKey("Agent");
	await vm.revoke(3);
	expect(api.createChannelKey).not.toHaveBeenCalled();
	expect(api.revokeChannelKey).not.toHaveBeenCalled();
	const second = vm.manage(9);
	old.resolve([key]);
	await first;
	expect(vm.getState()).toMatchObject({ managerId: 9, keys: [], keysLoading: true });
	latest.resolve([{ ...key, channelId: 9 }]);
	await second;
	expect(vm.getState()).toMatchObject({ keys: [{ ...key, channelId: 9 }], keysLoading: false });
});

test.each(["createKey", "revoke"] as const)(
	"%s errors belong only to the requesting settings page",
	async (operation) => {
		const { vm, api } = setup();
		await vm.manage(1);
		const failure = deferred<never>();
		if (operation === "createKey") api.createChannelKey.mockReturnValueOnce(failure.promise);
		else api.revokeChannelKey.mockReturnValueOnce(failure.promise);
		const mutation = operation === "createKey" ? vm.createKey("Agent") : vm.revoke(3);
		await vm.manage(9);
		failure.reject(Error("stale mutation"));
		await mutation;
		expect(vm.getState()).toMatchObject({ error: null, busy: false, managerId: 9 });
		api.createChannelKey.mockRejectedValue(Error("current mutation"));
		api.revokeChannelKey.mockRejectedValue(Error("current mutation"));
		if (operation === "createKey") await vm.createKey("Agent");
		else await vm.revoke(3);
		expect(vm.getState()).toMatchObject({ error: "current mutation", busy: false });
	},
);
