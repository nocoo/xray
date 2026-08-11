/**
 * Twitter data-export / handle-list parser for group bulk import.
 * Ported from legacy/v1 and adapted for offline v2 members (handle-primary).
 *
 * Only emits seeds with a real X handle (1–15 [A-Za-z0-9_]).
 * AccountId-only archive rows without screen_name / path username are skipped
 * (cannot scrape as handle; offline ID→handle resolve is out of scope).
 */

export type ImportMemberSeed = {
	/** Normalized later by caller; may include @ */
	handle: string;
	externalAuthorId?: string | null;
	displayName?: string | null;
};

/** Max raw import text size (bytes as UTF-16 length ≈ conservative). */
export const MEMBER_IMPORT_MAX_CHARS = 512_000;
/** Max seeds returned after parse+dedupe. */
export const MEMBER_IMPORT_MAX_SEEDS = 500;

interface FollowingEntry {
	following: { accountId?: unknown; userLink?: string };
}
interface FollowerEntry {
	follower: { accountId?: unknown; userLink?: string };
}

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

function normalizeJsToJson(js: string): string {
	let json = js.replace(/(?<=[{,]\s*)([a-zA-Z_]\w*)\s*:/g, '"$1":');
	json = json.replace(/,\s*([}\]])/g, "$1");
	return json;
}

/** Try screen name from userLink (path or query). */
export function handleFromUserLink(link: string | undefined | null): string | null {
	if (!link || typeof link !== "string") return null;
	const trimmed = link.trim();
	try {
		const u = new URL(trimmed);
		const sn = u.searchParams.get("screen_name") || u.searchParams.get("screenName");
		if (sn?.trim()) {
			const h = sn.trim().replace(/^@+/, "");
			return isValidXHandle(h) ? h : null;
		}
		// https://twitter.com/jack or https://x.com/jack
		const parts = u.pathname.split("/").filter(Boolean);
		const first = parts[0];
		if (parts.length === 1 && first && !/^(intent|i|home|search)$/i.test(first)) {
			const h = first.replace(/^@+/, "");
			return isValidXHandle(h) ? h : null;
		}
	} catch {
		/* not a URL */
	}
	return null;
}

export function isValidXHandle(h: string): boolean {
	return HANDLE_RE.test(h);
}

/**
 * Account IDs must stay exact — reject JS numbers outside safe integer range
 * (snowflake IDs lose precision as IEEE doubles).
 */
export function accountIdString(raw: unknown): string | null {
	if (typeof raw === "string") {
		const s = raw.trim();
		if (/^\d{1,20}$/.test(s)) return s;
		return null;
	}
	if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) {
		return String(raw);
	}
	return null;
}

function seedFromArchive(accountIdRaw: unknown, userLink?: string): ImportMemberSeed | null {
	const id = accountIdString(accountIdRaw);
	const fromLink = handleFromUserLink(userLink);
	if (!fromLink) return null; // no scrapeable handle offline
	return {
		handle: fromLink,
		externalAuthorId: id,
	};
}

/**
 * Parse Twitter YTD following.js / follower.js, or newline handle list / @handles.
 * Returns null only when content is empty or unusable.
 * Throws RangeError when text exceeds MEMBER_IMPORT_MAX_CHARS.
 */
export function parseMemberImportText(content: string): ImportMemberSeed[] | null {
	const text = content?.trim() ?? "";
	if (!text) return null;
	if (text.length > MEMBER_IMPORT_MAX_CHARS) {
		throw new RangeError(`import text exceeds ${MEMBER_IMPORT_MAX_CHARS} characters`);
	}

	// Twitter export JS
	const jsonStart = text.indexOf("[");
	if (jsonStart !== -1 && /window\.YTD\.|following|follower/i.test(text.slice(0, jsonStart + 20))) {
		const raw = text.slice(jsonStart).replace(/;\s*$/, "");
		let data: (FollowingEntry | FollowerEntry)[];
		try {
			data = JSON.parse(raw) as typeof data;
		} catch {
			try {
				data = JSON.parse(normalizeJsToJson(raw)) as typeof data;
			} catch {
				data = [];
			}
		}
		if (Array.isArray(data) && data.length > 0) {
			const first = data[0];
			const out: ImportMemberSeed[] = [];
			if (first && "following" in first) {
				for (const entry of data as FollowingEntry[]) {
					const seed = seedFromArchive(entry.following?.accountId, entry.following?.userLink);
					if (seed) out.push(seed);
				}
			} else if (first && "follower" in first) {
				for (const entry of data as FollowerEntry[]) {
					const seed = seedFromArchive(entry.follower?.accountId, entry.follower?.userLink);
					if (seed) out.push(seed);
				}
			}
			// Archive shape recognized — do not fall through to line tokenizer (avoids "intent" etc.)
			return out.length ? capSeeds(dedupeSeeds(out)) : null;
		}
	}

	// Pure JSON array: only string accountIds (or safe-integer numbers) are accepted as IDs,
	// but without handles they cannot become members — require objects with handle or skip.
	// Legacy pure-id lists are not importable as scrapeable members (return null).
	if (text.startsWith("[")) {
		try {
			const arr = JSON.parse(text) as unknown;
			if (Array.isArray(arr) && arr.length > 0) {
				// Array of {handle, accountId?} objects
				if (arr.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
					const out: ImportMemberSeed[] = [];
					for (const row of arr as Array<Record<string, unknown>>) {
						const hRaw =
							typeof row.handle === "string"
								? row.handle
								: typeof row.screen_name === "string"
									? row.screen_name
									: typeof row.username === "string"
										? row.username
										: null;
						const h = hRaw?.trim().replace(/^@+/, "") ?? "";
						if (!isValidXHandle(h)) continue;
						const id = accountIdString(row.accountId ?? row.id ?? row.user_id);
						out.push({ handle: h, externalAuthorId: id });
					}
					if (out.length) return capSeeds(dedupeSeeds(out));
				}
			}
		} catch {
			/* fall through */
		}
	}

	// One handle / @handle / x.com/handle per line (or comma-separated)
	const tokens = text
		.split(/[\n,]+/)
		.map((l) => l.trim())
		.filter(Boolean);
	const out: ImportMemberSeed[] = [];
	for (const tok of tokens) {
		let h = tok.replace(/^@+/, "");
		const m = h.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})(?:\/|$|\?)/i);
		if (m?.[1]) h = m[1];
		if (!isValidXHandle(h)) continue;
		out.push({ handle: h });
	}
	return out.length ? capSeeds(dedupeSeeds(out)) : null;
}

/** @deprecated alias — accountId list from legacy archive when handles present */
export function parseTwitterExportFile(content: string): string[] | null {
	const seeds = parseMemberImportText(content);
	if (!seeds) return null;
	const ids = seeds.map((s) => s.externalAuthorId).filter((x): x is string => !!x);
	return ids.length ? ids : null;
}

function capSeeds(seeds: ImportMemberSeed[]): ImportMemberSeed[] {
	return seeds.slice(0, MEMBER_IMPORT_MAX_SEEDS);
}

function dedupeSeeds(seeds: ImportMemberSeed[]): ImportMemberSeed[] {
	const seen = new Set<string>();
	const out: ImportMemberSeed[] = [];
	for (const s of seeds) {
		const key = s.handle.trim().replace(/^@+/, "").toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(s);
	}
	return out;
}
