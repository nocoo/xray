#!/usr/bin/env bun
/**
 * S4.7 — migrate v1 sqlite → D1 (docs/05).
 *
 * Usage:
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --dry-run
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --target local --kek-env XRAY_SECRETS_KEK
 *   bun run scripts/migrate-v1-to-d1.ts --sqlite path/to/xray.db --map email-map.json
 *
 * Migrates: users, watchlists, members(+profile display), tags, member_tags,
 * groups, group_members, non-secret settings, AI (from settings ai.* with KEK).
 * NOT: fetched_posts, zheto secrets.
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

type MapFile = Record<string, string>;
let emailMap: MapFile = {};
if (values.map) {
	emailMap = JSON.parse(await Bun.file(values.map).text()) as MapFile;
}

function qAll<T extends Record<string, unknown>>(sql: string): T[] {
	try {
		return src.query(sql).all() as T[];
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/no such table/i.test(msg)) return [];
		throw e;
	}
}

function qRequired<T extends Record<string, unknown>>(label: string, sql: string): T[] {
	try {
		return src.query(sql).all() as T[];
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`Required query failed (${label}): ${msg}`);
		process.exit(1);
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

const users = qRequired<{
	id: string;
	email: string | null;
	name: string | null;
	image: string | null;
}>("user", `SELECT id, email, name, image FROM user WHERE email IS NOT NULL AND email != ''`);

/** old v1 user.id → target D1 user id */
const idMap = new Map<string, string>();
const userIdByEmail = new Map<string, string>();
for (const u of users) {
	const email = String(u.email).toLowerCase();
	if (email.includes("e2e-test")) continue;
	const id = emailMap[email] || u.id;
	if (userIdByEmail.has(email) && userIdByEmail.get(email) !== id) {
		conflicts.push(`email conflict ${email}`);
	}
	userIdByEmail.set(email, id);
	idMap.set(u.id, id);
	stmts.push(
		`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
     VALUES (${sqlLit(id)}, ${sqlLit(email)}, ${sqlLit(u.name)}, ${sqlLit(u.image)}, NULL, NULL, ${now})
     ON CONFLICT(email) DO UPDATE SET name=excluded.name, image=excluded.image;`,
	);
}

function mapUid(old: string): string | null {
	return idMap.get(old) ?? null;
}

const watchlists = qRequired<{
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	icon: string | null;
	translate_enabled: number | null;
	created_at: unknown;
}>(
	"watchlists",
	`SELECT id, user_id, name, description, icon, translate_enabled, created_at FROM watchlists`,
);
for (const w of watchlists) {
	const wUser = mapUid(w.user_id);
	if (!wUser) continue;
	stmts.push(
		`INSERT INTO watchlists (id, user_id, name, description, icon, translate_enabled, created_at_ms)
     VALUES (${Number(w.id)}, ${sqlLit(wUser)}, ${sqlLit(w.name)}, ${sqlLit(w.description)}, ${sqlLit(
				w.icon || "eye",
			)}, ${w.translate_enabled ? 1 : 0}, ${msFrom(w.created_at)})
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, description=excluded.description,
       icon=excluded.icon, translate_enabled=excluded.translate_enabled;`,
	);
}

const profiles = qAll<{
	twitter_id: string;
	username: string;
	display_name: string | null;
}>(`SELECT twitter_id, username, display_name FROM twitter_profiles`);
const profileByTwId = new Map(profiles.map((p) => [p.twitter_id, p]));
const profileByUser = new Map(profiles.map((p) => [p.username.toLowerCase(), p]));

const members = qRequired<{
	id: number;
	user_id: string;
	watchlist_id: number | null;
	twitter_username: string;
	twitter_id: string | null;
	note: string | null;
	added_at: unknown;
}>(
	"watchlist_members",
	`SELECT id, user_id, watchlist_id, twitter_username, twitter_id, note, added_at FROM watchlist_members WHERE watchlist_id IS NOT NULL`,
);
for (const m of members) {
	const mUser = mapUid(m.user_id);
	if (!mUser || m.watchlist_id == null) continue;
	const handle = normalizeHandle(m.twitter_username || "");
	if (!handle) {
		conflicts.push(`member ${m.id} empty handle`);
		continue;
	}
	const p = (m.twitter_id && profileByTwId.get(m.twitter_id)) || profileByUser.get(handle) || null;
	stmts.push(
		`INSERT INTO watchlist_members
     (id, user_id, watchlist_id, source_type, external_author_id, handle, display_name, note, added_at_ms)
     VALUES (${Number(m.id)}, ${sqlLit(mUser)}, ${Number(m.watchlist_id)}, 'x.com', ${sqlLit(
				m.twitter_id,
			)}, ${sqlLit(handle)}, ${sqlLit(p?.display_name ?? null)}, ${sqlLit(m.note)}, ${msFrom(m.added_at)})
     ON CONFLICT(id) DO UPDATE SET
       handle=excluded.handle, display_name=excluded.display_name,
       note=excluded.note, external_author_id=excluded.external_author_id;`,
	);
}

const tags = qRequired<{ id: number; user_id: string; name: string; color: string }>(
	"tags",
	`SELECT id, user_id, name, color FROM tags`,
);
for (const t of tags) {
	const tUser = mapUid(t.user_id);
	if (!tUser) continue;
	stmts.push(
		`INSERT INTO tags (id, user_id, name, color)
     VALUES (${Number(t.id)}, ${sqlLit(tUser)}, ${sqlLit(t.name)}, ${sqlLit(t.color)})
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color;`,
	);
}

for (const j of qAll<{ member_id: number; tag_id: number }>(
	`SELECT member_id, tag_id FROM watchlist_member_tags`,
)) {
	stmts.push(
		`INSERT OR IGNORE INTO watchlist_member_tags (member_id, tag_id) VALUES (${Number(
			j.member_id,
		)}, ${Number(j.tag_id)});`,
	);
}

const groups = qRequired<{
	id: number;
	user_id: string;
	name: string;
	description: string | null;
	icon: string | null;
	created_at: unknown;
}>("groups", `SELECT id, user_id, name, description, icon, created_at FROM groups`);
for (const g of groups) {
	const gUser = mapUid(g.user_id);
	if (!gUser) continue;
	stmts.push(
		`INSERT INTO groups (id, user_id, name, description, icon, created_at_ms)
     VALUES (${Number(g.id)}, ${sqlLit(gUser)}, ${sqlLit(g.name)}, ${sqlLit(g.description)}, ${sqlLit(
				g.icon || "users",
			)}, ${msFrom(g.created_at)})
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, description=excluded.description, icon=excluded.icon;`,
	);
}

const gms = qRequired<{
	id: number;
	user_id: string;
	group_id: number;
	twitter_username: string;
	twitter_id: string | null;
	added_at: unknown;
}>(
	"group_members",
	`SELECT id, user_id, group_id, twitter_username, twitter_id, added_at FROM group_members`,
);
for (const m of gms) {
	const gmUser = mapUid(m.user_id);
	if (!gmUser) continue;
	const handle = normalizeHandle(m.twitter_username || "");
	if (!handle) continue;
	const p = (m.twitter_id && profileByTwId.get(m.twitter_id)) || profileByUser.get(handle) || null;
	stmts.push(
		`INSERT INTO group_members
     (id, user_id, group_id, source_type, external_author_id, handle, display_name, added_at_ms)
     VALUES (${Number(m.id)}, ${sqlLit(gmUser)}, ${Number(m.group_id)}, 'x.com', ${sqlLit(
				m.twitter_id,
			)}, ${sqlLit(handle)}, ${sqlLit(p?.display_name ?? null)}, ${msFrom(m.added_at)})
     ON CONFLICT(id) DO UPDATE SET
       handle=excluded.handle, display_name=excluded.display_name,
       external_author_id=excluded.external_author_id;`,
	);
}

const settings = qRequired<{ user_id: string; key: string; value: string }>(
	"settings",
	`SELECT user_id, key, value FROM settings`,
);
const aiByUser = new Map<string, Record<string, string>>();
for (const s of settings) {
	const uid = mapUid(s.user_id);
	if (!uid) continue;
	if (s.key.startsWith("ai.")) {
		const bag = aiByUser.get(uid) ?? {};
		bag[s.key] = s.value;
		aiByUser.set(uid, bag);
		continue;
	}
	if (s.key.startsWith("zheto.") || /apiKey|secret|token|password|webhook/i.test(s.key)) {
		conflicts.push(`skipped secret/integration setting ${s.user_id}:${s.key}`);
		continue;
	}
	stmts.push(
		`INSERT INTO settings (user_id, key, value, updated_at_ms) VALUES (${sqlLit(uid)}, ${sqlLit(
			s.key,
		)}, ${sqlLit(s.value)}, ${now})
     ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at_ms=excluded.updated_at_ms;`,
	);
}

const kekName = values["kek-env"];
const kek = kekName ? process.env[kekName] : undefined;
let aiMigrated = 0;
if (aiByUser.size && !kek) {
	conflicts.push(
		`AI configs for ${aiByUser.size} user(s) skipped: pass --kek-env (AES-GCM required)`,
	);
} else if (kek) {
	let kekBytes: Uint8Array;
	try {
		// accept 32-byte raw utf8 or base64/base64url of 32 bytes
		if (kek.length === 32) {
			kekBytes = new TextEncoder().encode(kek);
		} else {
			const b64 = kek.replace(/-/g, "+").replace(/_/g, "/");
			const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
			const bin = atob(b64 + pad);
			kekBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		}
		if (kekBytes.byteLength !== 32) throw new Error("KEK must be 32 bytes");
	} catch (e) {
		console.error("Invalid KEK:", e instanceof Error ? e.message : e);
		process.exit(1);
	}
	for (const [uid, bag] of aiByUser) {
		const provider = bag["ai.provider"];
		if (!provider) continue;
		const apiKey = bag["ai.apiKey"] ?? "";
		const model = bag["ai.model"] ?? null;
		const baseUrl = bag["ai.baseUrl"] ?? bag["ai.baseURL"] ?? bag["ai.base_url"] ?? null;
		const translationPrompt = bag["ai.translationPrompt"] ?? null;
		const summaryPrompt = bag["ai.summaryPrompt"] ?? null;
		const key = await crypto.subtle.importKey("raw", kekBytes, "AES-GCM", false, ["encrypt"]);
		const nonce = crypto.getRandomValues(new Uint8Array(12));
		const aad = new TextEncoder().encode(`${uid}:ai.api_key`);
		const ct = new Uint8Array(
			await crypto.subtle.encrypt(
				{ name: "AES-GCM", iv: nonce, additionalData: aad },
				key,
				new TextEncoder().encode(apiKey),
			),
		);
		const blob = new Uint8Array(1 + nonce.length + ct.length);
		blob[0] = 1;
		blob.set(nonce, 1);
		blob.set(ct, 1 + nonce.length);
		const hex = [...blob].map((b) => b.toString(16).padStart(2, "0")).join("");
		stmts.push(
			`INSERT INTO ai_configs
       (user_id, provider, model, base_url, api_key_ciphertext, api_key_key_version, translation_prompt, summary_prompt, updated_at_ms)
       VALUES (${sqlLit(uid)}, ${sqlLit(provider)}, ${sqlLit(model)}, ${sqlLit(baseUrl)}, X'${hex}', 1, ${sqlLit(translationPrompt)}, ${sqlLit(summaryPrompt)}, ${now})
       ON CONFLICT(user_id) DO UPDATE SET
         provider=excluded.provider, model=excluded.model, base_url=excluded.base_url,
         api_key_ciphertext=excluded.api_key_ciphertext, api_key_key_version=excluded.api_key_key_version,
         translation_prompt=excluded.translation_prompt, summary_prompt=excluded.summary_prompt,
         updated_at_ms=excluded.updated_at_ms;`,
		);
		aiMigrated += 1;
	}
}

const report = {
	dryRun: dry,
	target,
	counts: {
		source: {
			users: userIdByEmail.size,
			watchlists: watchlists.length,
			members: members.length,
			tags: tags.length,
			groups: groups.length,
			groupMembers: gms.length,
		},
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

if (aiByUser.size > 0 && !kek && !dry) {
	console.error("AI configs present but --kek-env missing — refuse apply");
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
