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
});
