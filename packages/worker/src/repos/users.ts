import type { AuthUser } from "../types.js";

export type AccessIdentity = {
	email: string;
	name?: string | null;
	image?: string | null;
	accessIss: string;
	accessSub: string;
};

type UserRow = {
	id: string;
	access_iss: string | null;
	access_sub: string | null;
	email: string;
	name: string | null;
	image: string | null;
};

function rowToUser(row: UserRow): AuthUser {
	return {
		id: row.id,
		email: row.email,
		name: row.name,
		image: row.image,
		accessIss: row.access_iss,
		accessSub: row.access_sub,
	};
}

/**
 * Upsert user by Access identity (R3-01 bind order).
 */
export async function upsertUserByAccess(
	db: D1Database,
	identity: AccessIdentity,
): Promise<AuthUser> {
	const email = identity.email.trim().toLowerCase();
	const now = Date.now();

	const byIdentity = await db
		.prepare(
			`SELECT id, access_iss, access_sub, email, name, image
       FROM users WHERE access_iss = ? AND access_sub = ? LIMIT 1`,
		)
		.bind(identity.accessIss, identity.accessSub)
		.first<UserRow>();

	if (byIdentity) {
		await db
			.prepare(
				`UPDATE users SET email = ?, name = ?, image = ? WHERE id = ?`,
			)
			.bind(email, identity.name ?? null, identity.image ?? null, byIdentity.id)
			.run();
		return rowToUser({
			...byIdentity,
			email,
			name: identity.name ?? null,
			image: identity.image ?? null,
		});
	}

	const unbound = await db
		.prepare(
			`SELECT id, access_iss, access_sub, email, name, image
       FROM users WHERE email = ? AND access_sub IS NULL LIMIT 1`,
		)
		.bind(email)
		.first<UserRow>();

	if (unbound) {
		const result = await db
			.prepare(
				`UPDATE users
         SET access_iss = ?, access_sub = ?, name = COALESCE(?, name), image = COALESCE(?, image)
         WHERE id = ? AND access_sub IS NULL`,
			)
			.bind(
				identity.accessIss,
				identity.accessSub,
				identity.name ?? null,
				identity.image ?? null,
				unbound.id,
			)
			.run();
		if ((result.meta.changes ?? 0) === 0) {
			throw new UserBindConflictError("race lost binding access identity");
		}
		return {
			id: unbound.id,
			email,
			name: identity.name ?? unbound.name,
			image: identity.image ?? unbound.image,
			accessIss: identity.accessIss,
			accessSub: identity.accessSub,
		};
	}

	const conflict = await db
		.prepare(`SELECT id, access_sub FROM users WHERE email = ? LIMIT 1`)
		.bind(email)
		.first<{ id: string; access_sub: string | null }>();
	if (conflict?.access_sub && conflict.access_sub !== identity.accessSub) {
		throw new UserBindConflictError("email bound to different access identity");
	}

	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO users (id, access_iss, access_sub, email, name, image, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			id,
			identity.accessIss,
			identity.accessSub,
			email,
			identity.name ?? null,
			identity.image ?? null,
			now,
		)
		.run();

	return {
		id,
		email,
		name: identity.name ?? null,
		image: identity.image ?? null,
		accessIss: identity.accessIss,
		accessSub: identity.accessSub,
	};
}

export class UserBindConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UserBindConflictError";
	}
}
