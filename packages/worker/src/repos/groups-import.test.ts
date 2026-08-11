import { parseMemberImportText } from "@xray/shared";
import { describe, expect, test } from "vitest";
import {
	addGroupMember,
	bulkImportGroupMembers,
	copyGroupMembersToWatchlist,
	createGroup,
	listGroupMembers,
} from "./groups.js";

type Row = Record<string, unknown>;

function mockDb() {
	const groups: Row[] = [];
	const group_members: Row[] = [];
	const watchlists: Row[] = [];
	const watchlist_members: Row[] = [];
	let gid = 1;
	let gmid = 1;
	let wlid = 1;
	let wmid = 1;

	const db = {
		prepare(sql: string) {
			const s = sql.replace(/\s+/g, " ");
			return {
				bind(...binds: unknown[]) {
					return {
						async first<T>() {
							if (s.includes("FROM groups") && s.includes("AND g.id = ?")) {
								const g = groups.find((x) => x.user_id === binds[0] && x.id === binds[1]);
								if (!g) return null;
								return {
									...g,
									member_count: group_members.filter((m) => m.group_id === g.id).length,
								} as T;
							}
							if (s.includes("FROM watchlists") && s.includes("AND id = ?")) {
								return (watchlists.find((w) => w.user_id === binds[0] && w.id === binds[1]) ??
									null) as T;
							}
							if (s.includes("FROM group_members WHERE id = ?")) {
								return (group_members.find((m) => m.id === binds[0] && m.user_id === binds[1]) ??
									null) as T;
							}
							if (s.includes("FROM watchlist_members WHERE id = ?")) {
								return (watchlist_members.find(
									(m) => m.id === binds[0] && m.user_id === binds[1],
								) ?? null) as T;
							}
							return null;
						},
						async all<T>() {
							if (s.includes("FROM group_members WHERE user_id")) {
								return {
									results: group_members.filter(
										(m) => m.user_id === binds[0] && m.group_id === binds[1],
									) as T[],
								};
							}
							if (s.includes("FROM groups g WHERE g.user_id")) {
								return {
									results: groups
										.filter((g) => g.user_id === binds[0])
										.map((g) => ({
											...g,
											member_count: group_members.filter((m) => m.group_id === g.id).length,
										})) as T[],
								};
							}
							if (s.includes("watchlist_member_tags")) {
								return { results: [] as T[] };
							}
							if (s.includes("FROM tags WHERE user_id")) {
								return { results: [] as T[] };
							}
							return { results: [] as T[] };
						},
						async run() {
							if (s.startsWith("INSERT INTO groups")) {
								const id = gid++;
								groups.push({
									id,
									user_id: binds[0],
									name: binds[1],
									description: binds[2],
									icon: binds[3],
									created_at_ms: binds[4],
								});
								return { meta: { last_row_id: id, changes: 1 } };
							}
							if (s.startsWith("INSERT INTO group_members")) {
								const handle = binds[4] as string;
								const group_id = binds[1] as number;
								if (
									group_members.some(
										(m) =>
											m.group_id === group_id && m.handle === handle && m.source_type === binds[2],
									)
								) {
									throw new Error("UNIQUE constraint failed");
								}
								const id = gmid++;
								group_members.push({
									id,
									user_id: binds[0],
									group_id,
									source_type: binds[2],
									external_author_id: binds[3],
									handle,
									display_name: binds[5],
									added_at_ms: binds[6],
								});
								return { meta: { last_row_id: id, changes: 1 } };
							}
							if (s.startsWith("INSERT INTO watchlist_members")) {
								const handle = binds[4] as string;
								const watchlist_id = binds[1] as number;
								if (
									watchlist_members.some(
										(m) =>
											m.watchlist_id === watchlist_id &&
											m.handle === handle &&
											m.source_type === binds[2],
									)
								) {
									throw new Error("UNIQUE constraint failed");
								}
								const id = wmid++;
								watchlist_members.push({
									id,
									user_id: binds[0],
									watchlist_id,
									source_type: binds[2],
									external_author_id: binds[3],
									handle,
									display_name: binds[5],
									note: binds[6],
									added_at_ms: binds[7],
								});
								return { meta: { last_row_id: id, changes: 1 } };
							}
							return { meta: { last_row_id: 0, changes: 0 } };
						},
					};
				},
			};
		},
		async batch() {
			return [];
		},
	} as unknown as D1Database;

	return {
		db,
		seedWatchlist(userId: string) {
			const id = wlid++;
			watchlists.push({ id, user_id: userId, name: "WL" });
			return id;
		},
		group_members,
		watchlist_members,
	};
}

describe("bulkImportGroupMembers + copyGroupMembersToWatchlist", () => {
	test("import handles then copy to watchlist is idempotent", async () => {
		const { db, seedWatchlist, watchlist_members } = mockDb();
		const g = await createGroup(db, "u1", { name: "G" });
		const seeds = parseMemberImportText("@alice\nbob\n@alice\n");
		expect(seeds).not.toBeNull();
		if (!seeds) return;
		const imp = await bulkImportGroupMembers(db, "u1", g.id, seeds);
		expect(imp.added).toBe(2);
		expect(imp.skipped).toBe(0);

		const again = await bulkImportGroupMembers(db, "u1", g.id, seeds);
		expect(again.added).toBe(0);
		expect(again.skipped).toBe(2);

		const members = await listGroupMembers(db, "u1", g.id);
		expect(members.map((m) => m.handle).sort()).toEqual(["alice", "bob"]);

		const wlId = seedWatchlist("u1");
		const copy = await copyGroupMembersToWatchlist(db, "u1", g.id, wlId);
		expect(copy.added).toBe(2);
		expect(watchlist_members).toHaveLength(2);

		const copy2 = await copyGroupMembersToWatchlist(db, "u1", g.id, wlId);
		expect(copy2.added).toBe(0);
		expect(copy2.skipped).toBe(2);
	});

	test("cross-user group → not found", async () => {
		const { db, seedWatchlist } = mockDb();
		const g = await createGroup(db, "u1", { name: "G" });
		await addGroupMember(db, "u1", g.id, { sourceType: "x.com", handle: "x" });
		const wl = seedWatchlist("u2");
		await expect(copyGroupMembersToWatchlist(db, "u2", g.id, wl)).rejects.toThrow(/not found/i);
	});
});
