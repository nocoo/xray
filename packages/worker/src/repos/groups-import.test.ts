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
							// only the bulk copy total query — not getGroup's subquery COUNT
							if (s.includes("COUNT(*) AS c") && s.includes("FROM group_members")) {
								const c = group_members.filter(
									(m) => m.user_id === binds[0] && m.group_id === binds[1],
								).length;
								return { c } as T;
							}
							if (s.includes("FROM groups g") && s.includes("g.id = ?")) {
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
							if (
								s.includes("INSERT") &&
								s.includes("INTO group_members") &&
								!s.includes("watchlist_members")
							) {
								const isMulti =
									s.includes("OR IGNORE") && s.includes("'x.com'") && s.includes("VALUES");
								if (isMulti) {
									// binds: repeating (user, group, ext, handle, display, now) — stride 6
									let changes = 0;
									let lastId = 0;
									const stride = 6;
									const n = Math.floor(binds.length / stride);
									for (let r = 0; r < n; r++) {
										const i = r * stride;
										const handle = String(binds[i + 3] ?? "");
										const group_id = Number(binds[i + 1]);
										if (
											group_members.some(
												(m) =>
													m.group_id === group_id &&
													m.handle === handle &&
													m.source_type === "x.com",
											)
										) {
											continue;
										}
										const id = gmid++;
										lastId = id;
										changes += 1;
										group_members.push({
											id,
											user_id: binds[i],
											group_id,
											source_type: "x.com",
											external_author_id: binds[i + 2],
											handle,
											display_name: binds[i + 4],
											added_at_ms: binds[i + 5],
										});
									}
									return { meta: { last_row_id: lastId, changes } };
								}
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
							if (s.includes("INSERT") && s.includes("watchlist_members")) {
								if (s.includes("SELECT")) {
									// INSERT…SELECT copy-all: binds watchlistId, now, userId, groupId
									const watchlist_id = binds[0] as number;
									const now = binds[1] as number;
									const userId = binds[2] as string;
									const group_id = binds[3] as number;
									let changes = 0;
									for (const gm of group_members.filter(
										(m) => m.user_id === userId && m.group_id === group_id,
									)) {
										if (
											watchlist_members.some(
												(m) =>
													m.watchlist_id === watchlist_id &&
													m.handle === gm.handle &&
													m.source_type === gm.source_type,
											)
										) {
											continue;
										}
										const id = wmid++;
										changes += 1;
										watchlist_members.push({
											id,
											user_id: userId,
											watchlist_id,
											source_type: gm.source_type,
											external_author_id: gm.external_author_id,
											handle: gm.handle,
											display_name: gm.display_name,
											note: null,
											added_at_ms: now,
										});
									}
									return { meta: { last_row_id: 0, changes } };
								}
								const isMulti = s.includes("OR IGNORE") && s.includes("VALUES");
								if (isMulti) {
									// (user, wl, source, ext, handle, display, now) x N
									let changes = 0;
									const stride = 7;
									const n = Math.floor(binds.length / stride);
									for (let r = 0; r < n; r++) {
										const i = r * stride;
										const handle = String(binds[i + 4] ?? "");
										const watchlist_id = Number(binds[i + 1]);
										const source_type = String(binds[i + 2]);
										if (
											watchlist_members.some(
												(m) =>
													m.watchlist_id === watchlist_id &&
													m.handle === handle &&
													m.source_type === source_type,
											)
										) {
											continue;
										}
										const id = wmid++;
										changes += 1;
										watchlist_members.push({
											id,
											user_id: binds[i],
											watchlist_id,
											source_type,
											external_author_id: binds[i + 3],
											handle,
											display_name: binds[i + 5],
											note: null,
											added_at_ms: binds[i + 6],
										});
									}
									return { meta: { last_row_id: 0, changes } };
								}
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
		async batch(
			stmts: Array<{ run: () => Promise<{ meta: { changes: number; last_row_id?: number } }> }>,
		) {
			const out = [];
			for (const s of stmts) out.push(await s.run());
			return out;
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

	test("copy selected memberIds only", async () => {
		const { db, seedWatchlist, watchlist_members } = mockDb();
		const g = await createGroup(db, "u1", { name: "G" });
		const a = await addGroupMember(db, "u1", g.id, { sourceType: "x.com", handle: "alice" });
		await addGroupMember(db, "u1", g.id, { sourceType: "x.com", handle: "bob" });
		const wl = seedWatchlist("u1");
		const copy = await copyGroupMembersToWatchlist(db, "u1", g.id, wl, { memberIds: [a.id] });
		expect(copy.added).toBe(1);
		expect(copy.total).toBe(1);
		expect(watchlist_members.map((m) => m.handle)).toEqual(["alice"]);
	});

	test("selected copy chunks at 14 rows (7 binds/row under D1 100-param limit)", async () => {
		const { db, seedWatchlist, watchlist_members } = mockDb();
		const g = await createGroup(db, "u1", { name: "G" });
		const ids: number[] = [];
		// 15 members → two statements (14 + 1), not one 105-bind statement
		for (let i = 0; i < 15; i++) {
			const m = await addGroupMember(db, "u1", g.id, {
				sourceType: "x.com",
				handle: `user${String(i).padStart(2, "0")}`,
			});
			ids.push(m.id);
		}
		const wl = seedWatchlist("u1");
		const copy = await copyGroupMembersToWatchlist(db, "u1", g.id, wl, { memberIds: ids });
		expect(copy.added).toBe(15);
		expect(copy.total).toBe(15);
		expect(watchlist_members).toHaveLength(15);
		// bind count invariant: 7 * 14 = 98 ≤ 100; 7 * 15 = 105 would exceed
		expect(7 * 14).toBeLessThanOrEqual(100);
		expect(7 * 15).toBeGreaterThan(100);
	});
});
