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
		const tweet = itemToTweet(item);
		expect(tweet?.id).toBe("t1");
		expect(tweet?.author.username).toBe("alice");
		expect(filterMembers([member], "custom")).toEqual([]);
		expect(filterMembers([member], "all")).toHaveLength(1);
		expect(sourceCounts([item, { ...item, id: 2, sourceType: "custom" }])).toEqual({
			all: 2,
			"x.com": 1,
			custom: 1,
		});
		const cols = distributeColumns([item, { ...item, id: 2, text: "x".repeat(200) }], 2);
		expect(cols).toHaveLength(2);
		expect(cols.flat()).toHaveLength(2);
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
				.mockResolvedValueOnce({ items: [item], next_cursor: null }),
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
		await vm.translate();
		expect(api.translateWatchlist).toHaveBeenCalledWith(3, { limit: 20 });
		await vm.removeMember(1);
		expect(api.deleteMember).toHaveBeenCalledWith(3, 1);
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
});
