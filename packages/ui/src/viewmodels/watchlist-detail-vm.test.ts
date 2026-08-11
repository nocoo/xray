import { describe, expect, test, vi } from "vitest";
import type { Member, TimelineItem, Watchlist } from "@/api/watchlists";
import {
	createWatchlistDetailVm,
	distributeColumns,
	filterMembers,
	itemToTweet,
	memberToCard,
	sourceCounts,
} from "./watchlist-detail-vm";

const wl: Watchlist = {
	id: 3,
	name: "WL",
	description: null,
	icon: "eye",
	translateEnabled: true,
	createdAtMs: 1,
	memberCount: 1,
};

const member: Member = {
	id: 1,
	watchlistId: 3,
	sourceType: "x.com",
	externalAuthorId: null,
	handle: "alice",
	displayName: "Alice",
	note: null,
	addedAtMs: 1,
	tags: [],
};

const item: TimelineItem = {
	id: 99,
	watchlistId: 3,
	sourceType: "x.com",
	externalId: "t1",
	memberId: 1,
	authorUsername: "alice",
	title: null,
	text: "hello world",
	createdAtMs: 1_700_000_000_000,
	ingestedAtMs: 1_700_000_000_000,
	payload: {
		body: { tweet: { id: "t1", text: "hello world", author_id: "u1" }, includes: { users: [] } },
		author: { id: "u1", username: "alice", display_name: "Alice" },
	},
	aiStatus: "pending",
	translatedText: null,
	summaryText: null,
	translationError: null,
};

describe("watchlist-detail pure helpers", () => {
	test("memberToCard + itemToTweet + filters", () => {
		const card = memberToCard(member);
		expect(card.handle).toBe("alice");
		expect(card.profile?.displayName).toBe("Alice");
		const noName = memberToCard({ ...member, displayName: null, sourceType: "custom" });
		expect(noName.profile).toBeNull();
		expect(itemToTweet({ ...item, sourceType: "custom" })).toBeNull();
		const tweet = itemToTweet(item);
		expect(tweet?.id).toBe("t1");
		expect(tweet?.author.username).toBe("alice");
		const bare = itemToTweet({
			...item,
			authorUsername: null,
			payload: null,
			externalId: "e9",
			text: "t",
		});
		expect(bare?.author.username).toBe("unknown");
		expect(bare?.url).toContain("/i/status/");
		const fromAuthor = itemToTweet({
			...item,
			payload: {
				author: {
					id: "u9",
					username: "bob",
					display_name: "Bob",
					avatar_url: "https://img",
				},
				body: { tweet: { id: "tid", text: "hi" } },
			},
		});
		expect(fromAuthor?.author.username).toBe("bob");
		expect(fromAuthor?.author.profile_image_url).toBe("https://img");
		const fromIncludes = itemToTweet({
			...item,
			payload: {
				body: {
					tweet: { id: "x", text: "y", author_id: "u1" },
					includes: { users: [{ id: "u1", username: "inc", name: "Inc" }] },
				},
			},
		});
		expect(fromIncludes?.author.username).toBe("inc");
		expect(filterMembers([member], "custom")).toEqual([]);
		expect(filterMembers([member], "x.com")).toHaveLength(1);
		expect(filterMembers([member], "all")).toHaveLength(1);
		expect(sourceCounts([item, { ...item, id: 2, sourceType: "custom" }])).toEqual({
			all: 2,
			"x.com": 1,
			custom: 1,
		});
		const cols = distributeColumns([item, { ...item, id: 2, text: "x".repeat(200) }], 2);
		expect(cols).toHaveLength(2);
		expect(cols.flat()).toHaveLength(2);
		expect(distributeColumns([], 1)).toEqual([[]]);
	});
});

describe("createWatchlistDetailVm", () => {
	test("load translate loadMore patch", async () => {
		const api = {
			fetchWatchlist: vi.fn().mockResolvedValue(wl),
			fetchMembers: vi.fn().mockResolvedValue([member]),
			fetchItems: vi
				.fn()
				.mockResolvedValueOnce({ items: [item], next_cursor: "c2" })
				.mockResolvedValueOnce({ items: [{ ...item, id: 100 }], next_cursor: null })
				.mockResolvedValueOnce({ items: [item], next_cursor: null })
				.mockResolvedValueOnce({ items: [item], next_cursor: "c3" })
				.mockResolvedValueOnce({ items: [{ ...item, id: 101 }], next_cursor: null }),
			fetchWatchlistIngestLogs: vi.fn().mockResolvedValue([]),
			deleteMember: vi.fn().mockResolvedValue({ deleted: true }),
			translateWatchlist: vi.fn().mockResolvedValue({ results: [], timed_out: false }),
		};
		const vm = createWatchlistDetailVm(api, 3);
		await vm.load();
		expect(vm.getState().wl?.name).toBe("WL");
		expect(vm.getState().nextCursor).toBe("c2");
		await vm.loadMore();
		expect(vm.getState().items).toHaveLength(2);
		vm.onItemTranslated(99, { translatedText: "你好", summaryText: "s" });
		expect(vm.getState().items.find((i) => i.id === 99)?.translatedText).toBe("你好");
		vm.onItemTranslated(99, { translatedText: "你好2" });
		expect(vm.getState().items.find((i) => i.id === 99)?.summaryText).toBeNull();
		vm.onItemTranslated(404, { translatedText: "x" });
		await vm.translate();
		expect(api.translateWatchlist).toHaveBeenCalledWith(3, { limit: 20 });
		await vm.removeMember(1);
		expect(api.deleteMember).toHaveBeenCalledWith(3, 1);
		vm.setSourceFilter("x.com");
		await vi.waitFor(() => expect(api.fetchItems).toHaveBeenCalled());
		// filtered load more path
		api.fetchItems
			.mockResolvedValueOnce({ items: [item], next_cursor: "c3" })
			.mockResolvedValueOnce({ items: [{ ...item, id: 102 }], next_cursor: null });
		await vm.load();
		await vm.loadMore();
		expect(vm.getState().items.some((i) => i.id === 102)).toBe(true);
		// silent load
		await vm.load({ silent: true });
		// loadMore while already loadingMore is no-op when nextCursor null after last
		vm.getState();
		await vm.loadMore();
	});

	test("invalid id", async () => {
		const vm = createWatchlistDetailVm(
			{
				fetchWatchlist: vi.fn(),
				fetchMembers: vi.fn(),
				fetchItems: vi.fn(),
				fetchWatchlistIngestLogs: vi.fn(),
				deleteMember: vi.fn(),
				translateWatchlist: vi.fn(),
			},
			0,
		);
		await vm.load();
		expect(vm.getState().error).toBe("invalid watchlist");
	});

	test("load/loadMore/translate/remove errors + filter reload", async () => {
		const api = {
			fetchWatchlist: vi.fn().mockRejectedValueOnce(new Error("L")).mockResolvedValue(wl),
			fetchMembers: vi.fn().mockResolvedValue([member]),
			fetchItems: vi.fn().mockResolvedValue({ items: [item], next_cursor: null }),
			fetchWatchlistIngestLogs: vi.fn().mockResolvedValue([]),
			deleteMember: vi.fn().mockRejectedValue(new Error("rm")),
			translateWatchlist: vi
				.fn()
				.mockResolvedValueOnce({ results: [], timed_out: true })
				.mockRejectedValueOnce(new Error("tr")),
		};
		const vm = createWatchlistDetailVm(api, 3);
		await vm.load();
		expect(vm.getState().error).toBe("L");
		api.fetchWatchlist.mockResolvedValue(wl);
		await vm.load();
		await vm.translate();
		expect(vm.getState().error).toContain("timed out");
		await vm.translate();
		expect(vm.getState().error).toBe("tr");
		await vm.removeMember(1);
		expect(vm.getState().error).toBe("rm");
		vm.setActiveTab("members");
		expect(vm.getState().activeTab).toBe("members");
		vm.setSourceFilter("custom");
		expect(vm.getState().sourceFilter).toBe("custom");
		// loadMore no-op without cursor
		await vm.loadMore();
		api.fetchItems
			.mockResolvedValueOnce({ items: [item], next_cursor: "n" })
			.mockRejectedValueOnce(new Error("more"));
		await vm.load();
		await vm.loadMore();
		expect(vm.getState().error).toBe("more");
	});
});
