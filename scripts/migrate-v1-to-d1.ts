#!/usr/bin/env bun
/**
 * S4.7 / S45-01 — migrate v1 sqlite → D1 (docs/05).
 *
 * Usage:
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --dry-run
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --target local
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --target remote --map email-map.json
 *
 * Locked: users, watchlists, members(+profiles display), tags, member_tags, groups,
 * group_members, settings. NOT: fetched_posts, zheto secrets, TweAPI.
 * AI secrets: require --kek-env (placeholder encrypt) or skip with report.
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
		map: { type: "string" },
		out: { type: "string" },
	},
	allowPositionals: false,
});

if (!values.sqlite) {
	console.error(
		"Usage: --sqlite path [--dry-run] [--target local|remote] [--map email-map.json] [--kek-env NAME]",
	);
	process.exit(1);
}

const dry = Boolean(values["dry-run"]);
const target = values.target === "remote" ? "remote" : "local";
const src = new Database(values.sqlite, { readonly: true });

type MapFile = Record<string, string>; // oldEmail -> newUserId optional
let emailMap: MapFile = {};
if (values.map) {
	emailMap = JSON.parse(await Bun.file(values.map).text()) as MapFile;
}

function qAll<T extends Record<string, unknown>>(sql: string): T[] {
	try {
		return src.query(sql).all() as T[];
	} catch {
		return [];
	}
}

function sqlLit(v: string | null | undefined): string {
	if (v == null) return "NULL";
	return `'${String(v).replace(/'/g, "''")}'`;
}

function msFrom(v: unknown): number {
	if (v == null) return Date.now();
	if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
	const p = Date.parse(String(v));
	return Number.isFinite(p) ? p : Date.now();
}

const conflicts: string[] = [];
const stmts: string[] = [];
const now = Date.now();

// --- users (NextAuth table name: user) ---
const users = qAll<{
	id: string;
	email: string | null;
	name: string | null;
	image: string | null;
}>(`SELECT id, email, name, image FROM user WHERE email IS NOT NULL AND email != ''`);

const userIdByEmail = new Map<string, string>();
for (const u of users) {
	const email = String(u.email).toLowerCase();
	if (email.includes("e2e-test")) continue;
	const id = emailMap[email] || u.id;
	if (userIdByEmail.has(email) && userIdByEmail.get(email) !== id) {
		conflicts.push(`email conflict ${email}`);
	}
	userIdByEmail.set(email, id);
	stmts.push(
		`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
     VALUES (${sqlLit(id)}, ${sqlLit(email)}, ${sqlLit(u.name)}, ${sqlLit(u.image)}, NULL, NULL, ${now})
     ON CONFLICT(email) DO UPDATE SET name=excluded.name, image=excluded.image;`,
	);
}

// email -> id lookup helper from v1 user_id
const v1UserOk = new Set(users.map((u) => u.id));

// --- watchlists ---
const watchlists = qAll<{
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	icon: string | null;
	translate_enabled: number | null;
	created_at: unknown;
}>(`SELECT id, user_id, name, description, icon, translate_enabled, created_at FROM watchlists`);
for (const w of watchlists) {
	if (!v1UserOk.has(w.user_id)) continue;
	stmts.push(
		`INSERT OR REPLACE INTO watchlists (id, user_id, name, description, icon, translate_enabled, created_at_ms)
     VALUES (${Number(w.id)}, ${sqlLit(w.user_id)}, ${sqlLit(w.name)}, ${sqlLit(w.description)}, ${sqlLit(
				w.icon || "eye",
			)}, ${w.translate_enabled ? 1 : 0}, ${msFrom(w.created_at)});`,
	);
}

// --- profiles for display_name ---
const profiles = qAll<{
	twitter_id: string;
	username: string;
	display_name: string | null;
}>(`SELECT twitter_id, username, display_name FROM twitter_profiles`);
const profileByTwId = new Map(profiles.map((p) => [p.twitter_id, p]));
const profileByUser = new Map(profiles.map((p) => [p.username.toLowerCase(), p]));

// --- members ---
const members = qAll<{
	id: number;
	user_id: string;
	watchlist_id: number | null;
	twitter_username: string;
	twitter_id: string | null;
	note: string | null;
	added_at: unknown;
}>(
	`SELECT id, user_id, watchlist_id, twitter_username, twitter_id, note, added_at FROM watchlist_members WHERE watchlist_id IS NOT NULL`,
);
for (const m of members) {
	if (!v1UserOk.has(m.user_id) || m.watchlist_id == null) continue;
	const handle = normalizeHandle(m.twitter_username || "");
	if (!handle) {
		conflicts.push(`member ${m.id} empty handle`);
		continue;
	}
	const p = (m.twitter_id && profileByTwId.get(m.twitter_id)) || profileByUser.get(handle) || null;
	stmts.push(
		`INSERT OR REPLACE INTO watchlist_members
     (id, user_id, watchlist_id, source_type, external_author_id, handle, display_name, note, added_at_ms)
     VALUES (${Number(m.id)}, ${sqlLit(m.user_id)}, ${Number(m.watchlist_id)}, 'x.com', ${sqlLit(
				m.twitter_id,
			)}, ${sqlLit(handle)}, ${sqlLit(p?.display_name ?? null)}, ${sqlLit(m.note)}, ${msFrom(
				m.added_at,
			)});`,
	);
}

// --- tags ---
const tags = qAll<{ id: number; user_id: string; name: string; color: string }>(
	`SELECT id, user_id, name, color FROM tags`,
);
for (const t of tags) {
	if (!v1UserOk.has(t.user_id)) continue;
	stmts.push(
		`INSERT OR REPLACE INTO tags (id, user_id, name, color)
     VALUES (${Number(t.id)}, ${sqlLit(t.user_id)}, ${sqlLit(t.name)}, ${sqlLit(t.color)});`,
	);
}

const memberTags = qAll<{ member_id: number; tag_id: number }>(
	`SELECT member_id, tag_id FROM watchlist_member_tags`,
);
for (const j of memberTags) {
	stmts.push(
		`INSERT OR IGNORE INTO watchlist_member_tags (member_id, tag_id) VALUES (${Number(
			j.member_id,
		)}, ${Number(j.tag_id)});`,
	);
}

// --- groups ---
const groups = qAll<{
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	icon: string | null;
	created_at: unknown;
}>(`SELECT id, user_id, name, description, icon, created_at FROM groups`);
for (const g of groups) {
	if (!v1UserOk.has(g.user_id)) continue;
	stmts.push(
		`INSERT OR REPLACE INTO groups (id, user_id, name, description, icon, created_at_ms)
     VALUES (${Number(g.id)}, ${sqlLit(g.user_id)}, ${sqlLit(g.name)}, ${sqlLit(
				g.description,
			)}, ${sqlLit(g.icon || "users")}, ${msFrom(g.created_at)});`,
	);
}

const gms = qAll<{
	id: number;
	user_id: string;
	group_id: number;
	twitter_username: string;
	twitter_id: string | null;
	added_at: unknown;
}>(`SELECT id, user_id, group_id, twitter_username, twitter_id, added_at FROM group_members`);
for (const m of gms) {
	if (!v1UserOk.has(m.user_id)) continue;
	const handle = normalizeHandle(m.twitter_username || "");
	if (!handle) continue;
	const p = (m.twitter_id && profileByTwId.get(m.twitter_id)) || profileByUser.get(handle) || null;
	stmts.push(
		`INSERT OR REPLACE INTO group_members
     (id, user_id, group_id, source_type, external_author_id, handle, display_name, added_at_ms)
     VALUES (${Number(m.id)}, ${sqlLit(m.user_id)}, ${Number(m.group_id)}, 'x.com', ${sqlLit(
				m.twitter_id,
			)}, ${sqlLit(handle)}, ${sqlLit(p?.display_name ?? null)}, ${msFrom(m.added_at)});`,
	);
}

// --- settings (non-secret KV only) ---
const settings = qAll<{ user_id: string; key: string; value: string }>(
	`SELECT user_id, key, value FROM settings`,
);
for (const s of settings) {
	if (!v1UserOk.has(s.user_id)) continue;
	if (/key|secret|token|password/i.test(s.key)) {
		conflicts.push(`skipped secret-like setting ${s.user_id}:${s.key}`);
		continue;
	}
	stmts.push(
		`INSERT INTO settings (user_id, key, value, updated_at_ms) VALUES (${sqlLit(
			s.user_id,
		)}, ${sqlLit(s.key)}, ${sqlLit(s.value)}, ${now})
     ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at_ms=excluded.updated_at_ms;`,
	);
}

// --- AI configs: only if KEK provided (ciphertext placeholder) ---
const kekName = values["kek-env"];
const kek = kekName ? process.env[kekName] : undefined;
const aiRows = qAll<{
	user_id: string;
	provider: string | null;
	model: string | null;
	base_url: string | null;
	api_key: string | null;
}>(`SELECT user_id, provider, model, base_url, api_key FROM ai_settings`);
let aiMigrated = 0;
if (aiRows.length && !kek) {
	conflicts.push(`AI rows=${aiRows.length} skipped: pass --kek-env to migrate secrets`);
} else if (kek) {
	for (const a of aiRows) {
		if (!v1UserOk.has(a.user_id) || !a.provider) continue;
		// Minimal sealed blob: version|b64(plaintext) — replace with AES-GCM in hardening
		const sealed = Buffer.from(`v0:${a.api_key || ""}`, "utf8");
		stmts.push(
			`INSERT OR REPLACE INTO ai_configs
       (user_id, provider, model, base_url, api_key_ciphertext, api_key_key_version, updated_at_ms)
       VALUES (${sqlLit(a.user_id)}, ${sqlLit(a.provider)}, ${sqlLit(a.model)}, ${sqlLit(
					a.base_url,
				)}, X'${sealed.toString("hex")}', 1, ${now});`,
		);
		aiMigrated += 1;
	}
}

const report = {
	dryRun: dry,
	target,
	counts: {
		users: userIdByEmail.size,
		watchlists: watchlists.length,
		members: members.length,
		tags: tags.length,
		memberTags: memberTags.length,
		groups: groups.length,
		groupMembers: gms.length,
		settings: settings.length,
		aiMigrated,
		statements: stmts.length,
	},
	conflicts,
	fetched_posts: "NOT_MIGRATED",
	zheto: "NOT_MIGRATED_reenter",
};

console.log(JSON.stringify(report, null, 2));

if (conflicts.some((c) => c.includes("email conflict"))) {
	console.error("Fatal conflicts — abort");
	process.exit(1);
}

if (dry) {
	console.log("Dry-run complete — no writes.");
	process.exit(0);
}

const outPath = values.out || `/tmp/xray-migrate-${Date.now()}.sql`;
await Bun.write(outPath, `${stmts.join("\n")}\n`);
console.log(`Wrote ${stmts.length} statements → ${outPath}`);

const applyCmd =
	target === "remote"
		? `cd packages/worker && bunx wrangler d1 execute xray-db --remote --file=${outPath}`
		: `cd packages/worker && bunx wrangler d1 execute xray-db --local --env development --file=${outPath}`;

console.log(`Applying: ${applyCmd}`);
const proc = Bun.spawn(["bash", "-lc", applyCmd], {
	stdout: "inherit",
	stderr: "inherit",
	cwd: new URL("..", import.meta.url).pathname,
});
const code = await proc.exited;
if (code !== 0) {
	console.error(`wrangler apply failed exit=${code}`);
	process.exit(code);
}
console.log("Migration apply OK");
