/**
 * Twitter data-export / handle-list parser for group bulk import.
 * Ported from legacy/v1/src/lib/twitter-export.ts and extended for offline v2 members
 * (handle-primary): accountId-only rows become handle `u{id}` + externalAuthorId.
 */

export type ImportMemberSeed = {
	/** Normalized later by caller; may include @ */
	handle: string;
	externalAuthorId?: string | null;
	displayName?: string | null;
};

interface FollowingEntry {
	following: { accountId?: string; userLink?: string };
}
interface FollowerEntry {
	follower: { accountId?: string; userLink?: string };
}

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
		if (sn?.trim()) return sn.trim().replace(/^@+/, "");
		// https://twitter.com/jack or https://x.com/jack
		const parts = u.pathname.split("/").filter(Boolean);
		const first = parts[0];
		if (parts.length === 1 && first && !/^(intent|i|home|search)$/i.test(first)) {
			return first.replace(/^@+/, "");
		}
	} catch {
		/* not a URL */
	}
	return null;
}

/**
 * Parse Twitter YTD following.js / follower.js, or newline handle list / @handles.
 * Returns null only when content is empty or unusable.
 */
export function parseMemberImportText(content: string): ImportMemberSeed[] | null {
	const text = content?.trim() ?? "";
	if (!text) return null;

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
					const id = entry.following?.accountId?.trim();
					if (!id) continue;
					const fromLink = handleFromUserLink(entry.following?.userLink);
					out.push({
						handle: fromLink || `u${id}`,
						externalAuthorId: id,
					});
				}
			} else if (first && "follower" in first) {
				for (const entry of data as FollowerEntry[]) {
					const id = entry.follower?.accountId?.trim();
					if (!id) continue;
					const fromLink = handleFromUserLink(entry.follower?.userLink);
					out.push({
						handle: fromLink || `u${id}`,
						externalAuthorId: id,
					});
				}
			}
			if (out.length) return dedupeSeeds(out);
		}
	}

	// Legacy pure JSON array of accountIds
	if (text.startsWith("[")) {
		try {
			const arr = JSON.parse(text) as unknown;
			if (Array.isArray(arr) && arr.every((x) => typeof x === "string" || typeof x === "number")) {
				const out = (arr as Array<string | number>).map((id) => ({
					handle: `u${String(id)}`,
					externalAuthorId: String(id),
				}));
				if (out.length) return dedupeSeeds(out);
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
		const m = h.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})(?:\/|$)/i);
		if (m?.[1]) h = m[1];
		if (!/^[A-Za-z0-9_]{1,15}$/.test(h) && !/^u\d+$/.test(h)) continue;
		out.push({ handle: h });
	}
	return out.length ? dedupeSeeds(out) : null;
}

/** @deprecated alias — accountId-only list from legacy tests */
export function parseTwitterExportFile(content: string): string[] | null {
	const seeds = parseMemberImportText(content);
	if (!seeds) return null;
	const ids = seeds.map((s) => s.externalAuthorId).filter((x): x is string => !!x);
	return ids.length ? ids : null;
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
