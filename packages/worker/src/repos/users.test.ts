import { describe, expect, test } from "vitest";
import { UserBindConflictError, upsertUserByAccess } from "./users.js";

/** Minimal in-memory D1 stand-in for bind-order tests. */
function createMemoryDb() {
	const rows: Array<{
		id: string;
		access_iss: string | null;
		access_sub: string | null;
		email: string;
		name: string | null;
		image: string | null;
		created_at_ms: number;
	}> = [];

	const api = {
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...args: unknown[]) {
					binds.push(...args);
					return stmt;
				},
				async first<T>() {
					const s = sql.replace(/\s+/g, " ");
					if (s.includes("access_iss = ? AND access_sub = ?")) {
						const [iss, sub] = binds as [string, string];
						return (rows.find((r) => r.access_iss === iss && r.access_sub === sub) ??
							null) as T | null;
					}
					if (s.includes("email = ? AND access_sub IS NULL")) {
						const [email] = binds as [string];
						return (rows.find((r) => r.email === email && r.access_sub === null) ??
							null) as T | null;
					}
					if (s.includes("WHERE email = ? LIMIT 1")) {
						const [email] = binds as [string];
						const r = rows.find((x) => x.email === email);
						return (r ? { id: r.id, access_sub: r.access_sub } : null) as T | null;
					}
					return null;
				},
				async run() {
					const s = sql.replace(/\s+/g, " ");
					if (s.startsWith("UPDATE users SET email")) {
						const [email, name, image, id] = binds as [
							string,
							string | null,
							string | null,
							string,
						];
						const r = rows.find((x) => x.id === id);
						if (r) {
							r.email = email;
							r.name = name;
							r.image = image;
						}
						return { meta: { changes: r ? 1 : 0 } };
					}
					if (s.includes("SET access_iss")) {
						const [iss, sub, name, image, id] = binds as [
							string,
							string,
							string | null,
							string | null,
							string,
						];
						const r = rows.find((x) => x.id === id && x.access_sub === null);
						if (!r) return { meta: { changes: 0 } };
						r.access_iss = iss;
						r.access_sub = sub;
						if (name != null) r.name = name;
						if (image != null) r.image = image;
						return { meta: { changes: 1 } };
					}
					if (s.startsWith("INSERT INTO users")) {
						const [id, iss, sub, email, name, image, created] = binds as [
							string,
							string,
							string,
							string,
							string | null,
							string | null,
							number,
						];
						if (rows.some((r) => r.email === email)) {
							throw new Error("UNIQUE constraint failed: users.email");
						}
						rows.push({
							id,
							access_iss: iss,
							access_sub: sub,
							email,
							name,
							image,
							created_at_ms: created,
						});
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
			};
			return stmt;
		},
		_rows: rows,
	};
	return api as unknown as D1Database & { _rows: typeof rows };
}

describe("upsertUserByAccess", () => {
	test("inserts new user on first login", async () => {
		const db = createMemoryDb();
		const user = await upsertUserByAccess(db, {
			email: "A@X.com",
			name: "A",
			accessIss: "iss",
			accessSub: "sub-1",
		});
		expect(user.email).toBe("a@x.com");
		expect(user.accessSub).toBe("sub-1");
		expect(db._rows).toHaveLength(1);
	});

	test("updates existing identity", async () => {
		const db = createMemoryDb();
		const first = await upsertUserByAccess(db, {
			email: "a@x.com",
			name: "A",
			accessIss: "iss",
			accessSub: "sub-1",
		});
		const second = await upsertUserByAccess(db, {
			email: "a@x.com",
			name: "A2",
			accessIss: "iss",
			accessSub: "sub-1",
		});
		expect(second.id).toBe(first.id);
		expect(second.name).toBe("A2");
	});

	test("binds unbound email row", async () => {
		const db = createMemoryDb();
		db._rows.push({
			id: "u1",
			access_iss: null,
			access_sub: null,
			email: "m@x.com",
			name: "M",
			image: null,
			created_at_ms: 1,
		});
		const user = await upsertUserByAccess(db, {
			email: "m@x.com",
			accessIss: "iss",
			accessSub: "sub-m",
		});
		expect(user.id).toBe("u1");
		expect(user.accessSub).toBe("sub-m");
	});

	test("conflicts when email already bound to other sub", async () => {
		const db = createMemoryDb();
		await upsertUserByAccess(db, {
			email: "c@x.com",
			accessIss: "iss",
			accessSub: "sub-a",
		});
		await expect(
			upsertUserByAccess(db, {
				email: "c@x.com",
				accessIss: "iss",
				accessSub: "sub-b",
			}),
		).rejects.toBeInstanceOf(UserBindConflictError);
	});

	test("identity email change conflicts with another bound user", async () => {
		const db = createMemoryDb();
		await upsertUserByAccess(db, {
			email: "a@x.com",
			accessIss: "iss",
			accessSub: "sub-a",
		});
		await upsertUserByAccess(db, {
			email: "b@x.com",
			accessIss: "iss",
			accessSub: "sub-b",
		});
		await expect(
			upsertUserByAccess(db, {
				email: "b@x.com",
				accessIss: "iss",
				accessSub: "sub-a",
			}),
		).rejects.toBeInstanceOf(UserBindConflictError);
	});

	test("identity email change allowed when target free", async () => {
		const db = createMemoryDb();
		const u = await upsertUserByAccess(db, {
			email: "old@x.com",
			accessIss: "iss",
			accessSub: "sub-1",
		});
		const next = await upsertUserByAccess(db, {
			email: "new@x.com",
			name: "N",
			accessIss: "iss",
			accessSub: "sub-1",
		});
		expect(next.id).toBe(u.id);
		expect(next.email).toBe("new@x.com");
	});

	test("unbound race (0 changes) re-resolves identity", async () => {
		const db = createMemoryDb();
		db._rows.push({
			id: "u-race",
			access_iss: null,
			access_sub: null,
			email: "r@x.com",
			name: "R",
			image: null,
			created_at_ms: 1,
		});
		// After first() finds unbound, simulate concurrent bind by pre-binding another identity row
		// and force UPDATE changes=0 by marking row already bound before run.
		const origPrepare = db.prepare.bind(db);
		let updateSeen = false;
		(db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
			const stmt = origPrepare(sql);
			if (sql.includes("SET access_iss") && sql.includes("access_sub IS NULL")) {
				const origRun = stmt.run.bind(stmt);
				stmt.run = async () => {
					updateSeen = true;
					// mark unbound as already taken so WHERE access_sub IS NULL misses
					const row = db._rows.find((r) => r.email === "r@x.com");
					if (row) {
						row.access_iss = "iss";
						row.access_sub = "sub-r";
					}
					return origRun();
				};
			}
			return stmt;
		};
		const user = await upsertUserByAccess(db, {
			email: "r@x.com",
			accessIss: "iss",
			accessSub: "sub-r",
		});
		expect(updateSeen).toBe(true);
		expect(user.accessSub).toBe("sub-r");
	});

	test("concurrent insert unique error returns existing identity", async () => {
		const db = createMemoryDb();
		const origPrepare = db.prepare.bind(db);
		let inserts = 0;
		(db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
			const stmt = origPrepare(sql);
			if (sql.includes("INSERT INTO users")) {
				const origRun = stmt.run.bind(stmt);
				stmt.run = async (...args: unknown[]) => {
					inserts += 1;
					if (inserts === 1) {
						// seed winning row then throw unique
						db._rows.push({
							id: "winner",
							access_iss: "iss",
							access_sub: "sub-c",
							email: "c2@x.com",
							name: null,
							image: null,
							created_at_ms: 1,
						});
						throw new Error("UNIQUE constraint failed: users.email");
					}
					return origRun(...args);
				};
			}
			return stmt;
		};
		const user = await upsertUserByAccess(db, {
			email: "c2@x.com",
			accessIss: "iss",
			accessSub: "sub-c",
		});
		expect(user.id).toBe("winner");
	});

	test("update unique error becomes bind conflict", async () => {
		const db = createMemoryDb();
		await upsertUserByAccess(db, {
			email: "u1@x.com",
			accessIss: "iss",
			accessSub: "sub-1",
		});
		const origPrepare = db.prepare.bind(db);
		(db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
			const stmt = origPrepare(sql);
			if (sql.startsWith("UPDATE users SET email")) {
				stmt.run = async () => {
					throw new Error("UNIQUE constraint failed: users.email");
				};
			}
			return stmt;
		};
		await expect(
			upsertUserByAccess(db, {
				email: "taken@x.com",
				accessIss: "iss",
				accessSub: "sub-1",
			}),
		).rejects.toBeInstanceOf(UserBindConflictError);
	});

	test("non-unique update error rethrows", async () => {
		const db = createMemoryDb();
		await upsertUserByAccess(db, {
			email: "u2@x.com",
			accessIss: "iss",
			accessSub: "sub-2",
		});
		const origPrepare = db.prepare.bind(db);
		(db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
			const stmt = origPrepare(sql);
			if (sql.startsWith("UPDATE users SET email")) {
				stmt.run = async () => {
					throw new Error("disk full");
				};
			}
			return stmt;
		};
		await expect(
			upsertUserByAccess(db, {
				email: "u2b@x.com",
				accessIss: "iss",
				accessSub: "sub-2",
			}),
		).rejects.toThrow(/disk full/);
	});

	test("unbound race without identity row throws conflict", async () => {
		const db = createMemoryDb();
		db._rows.push({
			id: "u-lost",
			access_iss: null,
			access_sub: null,
			email: "lost@x.com",
			name: null,
			image: null,
			created_at_ms: 1,
		});
		const origPrepare = db.prepare.bind(db);
		(db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
			const stmt = origPrepare(sql);
			if (sql.includes("SET access_iss")) {
				stmt.run = async () => ({ meta: { changes: 0 } });
			}
			// identity re-resolve returns null
			if (sql.includes("access_iss = ? AND access_sub = ?")) {
				stmt.first = async () => null;
			}
			return stmt;
		};
		await expect(
			upsertUserByAccess(db, {
				email: "lost@x.com",
				accessIss: "iss",
				accessSub: "sub-lost",
			}),
		).rejects.toBeInstanceOf(UserBindConflictError);
	});

	test("insert unique with mismatched identity throws conflict", async () => {
		const db = createMemoryDb();
		const origPrepare = db.prepare.bind(db);
		(db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
			const stmt = origPrepare(sql);
			if (sql.includes("INSERT INTO users")) {
				stmt.run = async () => {
					throw new Error("UNIQUE constraint failed");
				};
			}
			if (sql.includes("access_iss = ? AND access_sub = ? OR email")) {
				stmt.first = async () =>
					({
						id: "other",
						access_iss: "other-iss",
						access_sub: "other-sub",
						email: "m2@x.com",
						name: null,
						image: null,
					}) as never;
			}
			return stmt;
		};
		await expect(
			upsertUserByAccess(db, {
				email: "m2@x.com",
				accessIss: "iss",
				accessSub: "sub-m2",
			}),
		).rejects.toBeInstanceOf(UserBindConflictError);
	});
});
