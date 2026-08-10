#!/usr/bin/env bun
/**
 * S4.7 — migrate v1 sqlite → D1 (docs/05).
 * Usage:
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --dry-run
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --target local
 *
 * Does NOT migrate fetched_posts / zheto secrets. AI secrets require --kek-env.
 */
import { Database } from "bun:sqlite";
import { parseArgs } from "node:util";
import { normalizeHandle } from "../packages/shared/src/handle.ts";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		sqlite: { type: "string" },
		target: { type: "string", default: "local" },
		"dry-run": { type: "boolean", default: false },
		"kek-env": { type: "string" },
	},
	allowPositionals: false,
});

if (!values.sqlite) {
	console.error("Usage: --sqlite path/to/xray.db [--dry-run] [--target local|remote]");
	process.exit(1);
}

const dry = Boolean(values["dry-run"]);
const db = new Database(values.sqlite, { readonly: true });

function count(table: string, where = "1=1"): number {
	try {
		return (db.query(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`).get() as { c: number }).c;
	} catch {
		return -1;
	}
}

const report = {
	users: count("user"), // nextauth table may be "user"
	usersAlt: count("users"),
	watchlists: count("watchlists"),
	members: count("watchlist_members"),
	tags: count("tags"),
	groups: count("groups"),
	groupMembers: count("group_members"),
	settings: count("settings"),
	ai: count("ai_settings") >= 0 ? count("ai_settings") : count("ai_configs"),
	fetchedPosts: count("fetched_posts"),
	dryRun: dry,
	target: values.target,
	note: "fetched_posts intentionally NOT migrated (D7)",
};

console.log(JSON.stringify(report, null, 2));

if (dry) {
	console.log("Dry-run only — no D1 writes.");
	process.exit(0);
}

// Local apply via wrangler batch SQL generation
const stmts: string[] = [];
const now = Date.now();

type V1User = { id: string; email: string; name: string | null; image: string | null };
let users: V1User[] = [];
try {
	users = db
		.query(
			`SELECT id, email, name, image FROM user WHERE email IS NOT NULL AND email != 'e2e-test-user'`,
		)
		.all() as V1User[];
} catch {
	try {
		users = db
			.query(`SELECT id, email, name, image FROM users WHERE email IS NOT NULL`)
			.all() as V1User[];
	} catch {
		console.error("Could not read users table");
		process.exit(1);
	}
}

for (const u of users) {
	const email = u.email.toLowerCase();
	stmts.push(
		`INSERT OR IGNORE INTO users (id, email, name, image, access_iss, access_sub, created_at_ms) VALUES (${sql(
			u.id,
		)}, ${sql(email)}, ${sql(u.name)}, ${sql(u.image)}, NULL, NULL, ${now});`,
	);
}

// watchlists if present
try {
	const wls = db
		.query(
			`SELECT id, user_id, name, description, icon, translate_enabled, created_at FROM watchlists`,
		)
		.all() as Array<Record<string, unknown>>;
	for (const w of wls) {
		const created = w.created_at ? Date.parse(String(w.created_at)) || now : now;
		stmts.push(
			`INSERT OR IGNORE INTO watchlists (id, user_id, name, description, icon, translate_enabled, created_at_ms) VALUES (${Number(
				w.id,
			)}, ${sql(String(w.user_id))}, ${sql(String(w.name))}, ${sql(
				w.description == null ? null : String(w.description),
			)}, ${sql(String(w.icon || "eye"))}, ${Number(w.translate_enabled) ? 1 : 0}, ${created});`,
		);
	}
} catch {
	console.warn("skip watchlists");
}

try {
	const members = db
		.query(
			`SELECT id, user_id, watchlist_id, twitter_username, twitter_id, display_name, note, created_at FROM watchlist_members`,
		)
		.all() as Array<Record<string, unknown>>;
	for (const m of members) {
		const handle = normalizeHandle(String(m.twitter_username || ""));
		if (!handle) continue;
		const created = m.created_at ? Date.parse(String(m.created_at)) || now : now;
		stmts.push(
			`INSERT OR IGNORE INTO watchlist_members (id, user_id, watchlist_id, source_type, external_author_id, handle, display_name, note, added_at_ms) VALUES (${Number(
				m.id,
			)}, ${sql(String(m.user_id))}, ${Number(m.watchlist_id)}, 'x.com', ${sql(
				m.twitter_id == null ? null : String(m.twitter_id),
			)}, ${sql(handle)}, ${sql(m.display_name == null ? null : String(m.display_name))}, ${sql(
				m.note == null ? null : String(m.note),
			)}, ${created});`,
		);
	}
} catch {
	console.warn("skip members");
}

const outPath = `/tmp/xray-migrate-${Date.now()}.sql`;
await Bun.write(outPath, stmts.join("\n"));
console.log(`Wrote ${stmts.length} statements → ${outPath}`);
console.log(
	values.target === "remote"
		? `Apply: cd packages/worker && bunx wrangler d1 execute xray-db --remote --file=${outPath}`
		: `Apply: cd packages/worker && bunx wrangler d1 execute xray-db --local --env development --file=${outPath}`,
);

function sql(v: string | null): string {
	if (v == null) return "NULL";
	return `'${v.replace(/'/g, "''")}'`;
}
