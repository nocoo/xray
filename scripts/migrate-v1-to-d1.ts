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
import { resolve } from "node:path";
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
if (values.target && values.target !== "local" && values.target !== "remote") {
	console.error("--target must be local|remote");
	process.exit(1);
}

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

/** UPSERT only when existing row belongs to same tenant (S45R-03 / S45RR-03). */
function conflictUpdate(_tableUserCol: "user_id", cols: string[]): string {
	const sets = cols.map((c) => `${c}=excluded.${c}`).join(", ");
	return `ON CONFLICT(id) DO UPDATE SET ${sets} WHERE user_id = excluded.user_id`;
}

const fatals: string[] = [];
const warnings: string[] = [];
const stmts: string[] = [];
const now = Date.now();
const generated = {
	users: 0,
	watchlists: 0,
	members: 0,
	tags: 0,
	memberTags: 0,
	skippedOrphanTags: 0,
	groups: 0,
	groupMembers: 0,
	settings: 0,
	ai: 0,
};

const users = qRequired<{
	id: string;
	email: string | null;
	name: string | null;
	image: string | null;
}>("user", `SELECT id, email, name, image FROM user WHERE email IS NOT NULL AND email != ''`);

/** old v1 user.id → target D1 user id */
const idMap = new Map<string, string>();
const userIdByEmail = new Map<string, string>();
const wlOwner = new Map<number, string>();
const groupOwner = new Map<number, string>();
const tagOwner = new Map<number, string>();
const memberOwner = new Map<number, string>();
const expected = {
	watchlists: [] as Array<{ id: number; userId: string }>,
	members: [] as Array<{ id: number; userId: string }>,
	tags: [] as Array<{ id: number; userId: string }>,
	groups: [] as Array<{ id: number; userId: string }>,
	groupMembers: [] as Array<{ id: number; userId: string }>,
};
for (const u of users) {
	const email = String(u.email).toLowerCase();
	if (email.includes("e2e-test")) continue;
	const id = emailMap[email] || u.id;
	if (userIdByEmail.has(email) && userIdByEmail.get(email) !== id) {
		fatals.push(`email conflict ${email}`);
	}
	userIdByEmail.set(email, id);
	idMap.set(u.id, id);
	stmts.push(
		`INSERT INTO users (id, email, name, image, access_iss, access_sub, created_at_ms)
     VALUES (${sqlLit(id)}, ${sqlLit(email)}, ${sqlLit(u.name)}, ${sqlLit(u.image)}, NULL, NULL, ${now})
     ON CONFLICT(email) DO UPDATE SET name=excluded.name, image=excluded.image;`,
	);
	generated.users += 1;
}

function mapUid(old: string): string | null {
	return idMap.get(old) ?? null;
}

function requireMapped(ownerOld: string, label: string): string | null {
	const uid = mapUid(ownerOld);
	if (!uid) {
		fatals.push(`unmapped owner ${label} user_id=${ownerOld}`);
		return null;
	}
	return uid;
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
	const wUser = requireMapped(w.user_id, `watchlist:${w.id}`);
	if (!wUser) continue;
	stmts.push(
		`INSERT INTO watchlists (id, user_id, name, description, icon, translate_enabled, created_at_ms)
     VALUES (${Number(w.id)}, ${sqlLit(wUser)}, ${sqlLit(w.name)}, ${sqlLit(w.description)}, ${sqlLit(
				w.icon || "eye",
			)}, ${w.translate_enabled ? 1 : 0}, ${msFrom(w.created_at)})
     ${conflictUpdate("user_id", ["name", "description", "icon", "translate_enabled"])};`,
	);
	wlOwner.set(Number(w.id), wUser);
	expected.watchlists.push({ id: Number(w.id), userId: wUser });
	generated.watchlists += 1;
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
const memberIds = new Set<number>();
for (const m of members) {
	const mUser = requireMapped(m.user_id, `member:${m.id}`);
	if (!mUser || m.watchlist_id == null) continue;
	const wlOwn = wlOwner.get(Number(m.watchlist_id));
	if (!wlOwn) {
		fatals.push(`member ${m.id} parent watchlist ${m.watchlist_id} missing`);
		continue;
	}
	if (wlOwn !== mUser) {
		fatals.push(`member ${m.id} cross-tenant parent watchlist ${m.watchlist_id}`);
		continue;
	}
	const handle = normalizeHandle(m.twitter_username || "");
	if (!handle) {
		fatals.push(`member ${m.id} empty handle`);
		continue;
	}
	const p = (m.twitter_id && profileByTwId.get(m.twitter_id)) || profileByUser.get(handle) || null;
	stmts.push(
		`INSERT INTO watchlist_members
     (id, user_id, watchlist_id, source_type, external_author_id, handle, display_name, note, added_at_ms)
     VALUES (${Number(m.id)}, ${sqlLit(mUser)}, ${Number(m.watchlist_id)}, 'x.com', ${sqlLit(
				m.twitter_id,
			)}, ${sqlLit(handle)}, ${sqlLit(p?.display_name ?? null)}, ${sqlLit(m.note)}, ${msFrom(m.added_at)})
     ${conflictUpdate("user_id", ["handle", "display_name", "note", "external_author_id", "watchlist_id"])};`,
	);
	memberIds.add(Number(m.id));
	memberOwner.set(Number(m.id), mUser);
	expected.members.push({ id: Number(m.id), userId: mUser });
	generated.members += 1;
}

const tags = qRequired<{ id: number; user_id: string; name: string; color: string }>(
	"tags",
	`SELECT id, user_id, name, color FROM tags`,
);
const tagIds = new Set<number>();
for (const t of tags) {
	const tUser = requireMapped(t.user_id, `tag:${t.id}`);
	if (!tUser) continue;
	stmts.push(
		`INSERT INTO tags (id, user_id, name, color)
     VALUES (${Number(t.id)}, ${sqlLit(tUser)}, ${sqlLit(t.name)}, ${sqlLit(t.color)})
     ${conflictUpdate("user_id", ["name", "color"])};`,
	);
	tagIds.add(Number(t.id));
	tagOwner.set(Number(t.id), tUser);
	expected.tags.push({ id: Number(t.id), userId: tUser });
	generated.tags += 1;
}

const memberTags = qRequired<{ member_id: number; tag_id: number }>(
	"watchlist_member_tags",
	`SELECT member_id, tag_id FROM watchlist_member_tags`,
);
for (const j of memberTags) {
	const mid = Number(j.member_id);
	const tid = Number(j.tag_id);
	if (!memberIds.has(mid) || !tagIds.has(tid)) {
		// audited skip — real v1 DBs may have orphans (S45RR-01/02)
		warnings.push(`orphan member_tag skipped member=${j.member_id} tag=${j.tag_id}`);
		generated.skippedOrphanTags += 1;
		continue;
	}
	const mo = memberOwner.get(mid);
	const to = tagOwner.get(tid);
	if (mo && to && mo !== to) {
		fatals.push(`cross-tenant member_tag member=${mid} tag=${tid}`);
		continue;
	}
	stmts.push(
		`INSERT OR IGNORE INTO watchlist_member_tags (member_id, tag_id) VALUES (${Number(
			j.member_id,
		)}, ${Number(j.tag_id)});`,
	);
	generated.memberTags += 1;
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
	const gUser = requireMapped(g.user_id, `group:${g.id}`);
	if (!gUser) continue;
	stmts.push(
		`INSERT INTO groups (id, user_id, name, description, icon, created_at_ms)
     VALUES (${Number(g.id)}, ${sqlLit(gUser)}, ${sqlLit(g.name)}, ${sqlLit(g.description)}, ${sqlLit(
				g.icon || "users",
			)}, ${msFrom(g.created_at)})
     ${conflictUpdate("user_id", ["name", "description", "icon"])};`,
	);
	groupOwner.set(Number(g.id), gUser);
	expected.groups.push({ id: Number(g.id), userId: gUser });
	generated.groups += 1;
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
	const gmUser = requireMapped(m.user_id, `group_member:${m.id}`);
	if (!gmUser) continue;
	const gOwn = groupOwner.get(Number(m.group_id));
	if (!gOwn) {
		fatals.push(`group_member ${m.id} parent group ${m.group_id} missing`);
		continue;
	}
	if (gOwn !== gmUser) {
		fatals.push(`group_member ${m.id} cross-tenant parent group ${m.group_id}`);
		continue;
	}
	const handle = normalizeHandle(m.twitter_username || "");
	if (!handle) {
		fatals.push(`group_member ${m.id} empty handle`);
		continue;
	}
	const p = (m.twitter_id && profileByTwId.get(m.twitter_id)) || profileByUser.get(handle) || null;
	stmts.push(
		`INSERT INTO group_members
     (id, user_id, group_id, source_type, external_author_id, handle, display_name, added_at_ms)
     VALUES (${Number(m.id)}, ${sqlLit(gmUser)}, ${Number(m.group_id)}, 'x.com', ${sqlLit(
				m.twitter_id,
			)}, ${sqlLit(handle)}, ${sqlLit(p?.display_name ?? null)}, ${msFrom(m.added_at)})
     ${conflictUpdate("user_id", ["handle", "display_name", "external_author_id", "group_id"])};`,
	);
	expected.groupMembers.push({ id: Number(m.id), userId: gmUser });
	generated.groupMembers += 1;
}

const settings = qRequired<{ user_id: string; key: string; value: string }>(
	"settings",
	`SELECT user_id, key, value FROM settings`,
);
const aiByUser = new Map<string, Record<string, string>>();
for (const s of settings) {
	const uid = requireMapped(s.user_id, `settings:${s.key}`);
	if (!uid) continue;
	if (s.key.startsWith("ai.")) {
		const bag = aiByUser.get(uid) ?? {};
		bag[s.key] = s.value;
		aiByUser.set(uid, bag);
		continue;
	}
	if (s.key.startsWith("zheto.") || /apiKey|secret|token|password|webhook/i.test(s.key)) {
		warnings.push(`skipped secret/integration setting ${s.user_id}:${s.key}`);
		continue;
	}
	stmts.push(
		`INSERT INTO settings (user_id, key, value, updated_at_ms) VALUES (${sqlLit(uid)}, ${sqlLit(
			s.key,
		)}, ${sqlLit(s.value)}, ${now})
     ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at_ms=excluded.updated_at_ms;`,
	);
	generated.settings += 1;
}

const kekName = values["kek-env"];
const kek = kekName ? Bun.env[kekName] : undefined;
const keyVersionEnv = Bun.env[`XRAY${"_"}SECRETS_KEY_VERSION`] ?? "1";
const keyVersion = Number(keyVersionEnv);
if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 255) {
	fatals.push("XRAY_SECRETS_KEY_VERSION must be integer 1–255");
}

if (aiByUser.size && !kek) {
	const msg = `AI configs for ${aiByUser.size} user(s) require --kek-env (AES-GCM)`;
	if (dry) warnings.push(msg);
	else fatals.push(msg);
} else if (kek) {
	let kekBytes: Uint8Array;
	try {
		// Strict 32-byte: raw utf8 (length 32) OR base64/base64url of 32 bytes (S45R-02).
		// Never SHA-256-derive from arbitrary strings.
		if (new TextEncoder().encode(kek).byteLength === 32 && kek.length === 32) {
			kekBytes = new TextEncoder().encode(kek);
		} else {
			const b64 = kek.replace(/-/g, "+").replace(/_/g, "/");
			const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
			const bin = atob(b64 + pad);
			kekBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		}
		if (kekBytes.byteLength !== 32) throw new Error("KEK must decode to exactly 32 bytes");
	} catch (e) {
		console.error("Invalid KEK:", e instanceof Error ? e.message : e);
		process.exit(1);
	}
	for (const [uid, bag] of aiByUser) {
		const provider = bag["ai.provider"];
		if (!provider) {
			fatals.push(`ai config for ${uid} missing ai.provider`);
			continue;
		}
		const apiKey = bag["ai.apiKey"] ?? "";
		if (!apiKey) {
			fatals.push(`ai config for ${uid} missing ai.apiKey`);
			continue;
		}
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
		blob[0] = keyVersion & 0xff;
		blob.set(nonce, 1);
		blob.set(ct, 1 + nonce.length);
		const hex = [...blob].map((b) => b.toString(16).padStart(2, "0")).join("");
		stmts.push(
			`INSERT INTO ai_configs
       (user_id, provider, model, base_url, api_key_ciphertext, api_key_key_version, translation_prompt, summary_prompt, updated_at_ms)
       VALUES (${sqlLit(uid)}, ${sqlLit(provider)}, ${sqlLit(model)}, ${sqlLit(baseUrl)}, X'${hex}', ${keyVersion}, ${sqlLit(translationPrompt)}, ${sqlLit(summaryPrompt)}, ${now})
       ON CONFLICT(user_id) DO UPDATE SET
         provider=excluded.provider, model=excluded.model, base_url=excluded.base_url,
         api_key_ciphertext=excluded.api_key_ciphertext, api_key_key_version=excluded.api_key_key_version,
         translation_prompt=excluded.translation_prompt, summary_prompt=excluded.summary_prompt,
         updated_at_ms=excluded.updated_at_ms;`,
		);
		generated.ai += 1;
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
			settings: settings.length,
			aiUsers: aiByUser.size,
		},
		generated,
		statements: stmts.length,
	},
	fatals,
	warnings,
	fetched_posts: "NOT_MIGRATED",
	zheto: "NOT_MIGRATED_reenter",
};

console.log(JSON.stringify(report, null, 2));

if (fatals.length > 0) {
	console.error(`Fatal conflicts (${fatals.length}) — abort`);
	for (const f of fatals.slice(0, 20)) console.error(`  - ${f}`);
	process.exit(1);
}

if (dry) {
	console.log("Dry-run complete — no writes.");
	process.exit(0);
}

const outRaw = values.out || `/tmp/xray-migrate-${Date.now()}.sql`;
// Reject shell metacharacters in out path (S45R-15)
if (/[;&|`$<>\\\n\r]/.test(outRaw) || outRaw.includes("..")) {
	console.error("Invalid --out path");
	process.exit(1);
}
let outPath = resolve(outRaw);
if (!outPath.toLowerCase().endsWith(".sql")) outPath = `${outPath}.sql`;
const validatePath = `${outPath.slice(0, -4)}.validate.sql`;
if (validatePath === outPath) {
	console.error("Invalid --out path (cannot derive validation file)");
	process.exit(1);
}

await Bun.write(outPath, `${stmts.join("\n")}\n`);
console.log(`Wrote ${stmts.length} statements → ${outPath}`);
// keep path for operators who want a sidecar note
await Bun.write(
	validatePath,
	`-- human-readable validation notes; runtime uses --command checks\n-- expected watchlists=${expected.watchlists.length} members=${expected.members.length} tags=${expected.tags.length} groups=${expected.groups.length} groupMembers=${expected.groupMembers.length}\n`,
);
console.log(`Validation notes → ${validatePath}`);

const workerCwd = resolve(import.meta.dir, "../packages/worker");
async function wranglerExecute(extra: string[]): Promise<{ code: number; text: string }> {
	const base =
		target === "remote"
			? ["bunx", "wrangler", "d1", "execute", "xray-db", "--remote"]
			: ["bunx", "wrangler", "d1", "execute", "xray-db", "--local", "--env", "development"];
	const args = [...base, ...extra, "--json"];
	console.log(`Running: ${args.join(" ")} (cwd=${workerCwd})`);
	const proc = Bun.spawn(args, { stdout: "pipe", stderr: "inherit", cwd: workerCwd });
	const code = await proc.exited;
	const text = proc.stdout ? await new Response(proc.stdout).text() : "";
	return { code, text };
}

function firstCount(text: string): number | null {
	// wrangler --json returns nested results; pick first integer count-like value
	try {
		const data = JSON.parse(text) as unknown;
		const stack: unknown[] = [data];
		while (stack.length) {
			const cur = stack.pop();
			if (Array.isArray(cur)) {
				stack.push(...cur);
				continue;
			}
			if (cur && typeof cur === "object") {
				const o = cur as Record<string, unknown>;
				for (const [k, v] of Object.entries(o)) {
					if (typeof v === "number" && /^(bad_|missing_|count|COUNT)/i.test(k)) return v;
					if (typeof v === "number" && Object.keys(o).length === 1) return v;
					stack.push(v);
				}
			}
		}
	} catch {
		/* fall through */
	}
	const m = text.match(/"\w+"\s*:\s*(\d+)/);
	return m ? Number(m[1]) : null;
}

const apply = await wranglerExecute([`--file=${outPath}`]);
if (apply.code !== 0) {
	console.error(`wrangler apply failed exit=${apply.code}`);
	process.exit(apply.code);
}

async function mustCount(label: string, sql: string, expect: number) {
	const { code, text } = await wranglerExecute([`--command=${sql}`]);
	if (code !== 0) {
		console.error(`validation query failed: ${label}`);
		process.exit(code);
	}
	const n = firstCount(text);
	if (n === null) {
		console.error(`validation parse failed: ${label}\n${text.slice(0, 500)}`);
		process.exit(2);
	}
	if (n !== expect) {
		console.error(`validation failed: ${label}=${n} expected ${expect}`);
		process.exit(2);
	}
	console.log(`ok ${label}=${n}`);
}

await mustCount(
	"bad_members",
	`SELECT COUNT(*) AS c FROM watchlist_members m WHERE NOT EXISTS (SELECT 1 FROM watchlists w WHERE w.id=m.watchlist_id AND w.user_id=m.user_id)`,
	0,
);
await mustCount(
	"bad_group_members",
	`SELECT COUNT(*) AS c FROM group_members gm WHERE NOT EXISTS (SELECT 1 FROM groups g WHERE g.id=gm.group_id AND g.user_id=gm.user_id)`,
	0,
);
await mustCount(
	"bad_tags",
	`SELECT COUNT(*) AS c FROM watchlist_member_tags j LEFT JOIN watchlist_members m ON m.id=j.member_id LEFT JOIN tags t ON t.id=j.tag_id WHERE m.id IS NULL OR t.id IS NULL OR m.user_id != t.user_id`,
	0,
);
async function mustOwn(table: string, rows: Array<{ id: number; userId: string }>) {
	if (!rows.length) return;
	// SQLite/D1: CTE VALUES with explicit column names
	const vals = rows.map((r) => `(${r.id}, ${sqlLit(r.userId)})`).join(",");
	await mustCount(
		`${table}_owned`,
		`WITH e(id, user_id) AS (VALUES ${vals}) SELECT COUNT(*) AS c FROM ${table} t JOIN e ON t.id = e.id AND t.user_id = e.user_id`,
		rows.length,
	);
}
await mustOwn("watchlists", expected.watchlists);
await mustOwn("watchlist_members", expected.members);
await mustOwn("tags", expected.tags);
await mustOwn("groups", expected.groups);
await mustOwn("group_members", expected.groupMembers);

console.log("Migration apply OK");
