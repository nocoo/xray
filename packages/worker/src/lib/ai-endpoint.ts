/** Shared OpenAI-compatible base URL validation (save / test / translate). */

export type EndpointOk = { ok: true; base: string; chatCompletionsUrl: string };
export type EndpointErr = { ok: false; error: string };

/**
 * Require https and reject loopback / link-local / RFC1918 / ULA / .local/.internal.
 */
export function resolveAiBaseUrl(raw: string | null | undefined): EndpointOk | EndpointErr {
	const trimmed = (raw?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
	let u: URL;
	try {
		u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
	} catch {
		return { ok: false, error: "invalid baseUrl" };
	}
	if (u.protocol !== "https:") return { ok: false, error: "baseUrl must be https" };

	// strip trailing DNS dots (localhost. / foo.local.)
	const host = u.hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.+$/, "");
	if (isBlockedHost(host)) return { ok: false, error: "baseUrl host not allowed" };

	const base = `${u.origin}${u.pathname}`.replace(/\/$/, "");
	return { ok: true, base, chatCompletionsUrl: `${base}/chat/completions` };
}

function isBlockedIpv4(host: string): boolean {
	if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
	const parts = host.split(".").map(Number);
	const [a, b] = parts;
	if (a === 10 || a === 127 || a === 0) return true;
	if (a === 169 && b === 254) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b != null && b >= 16 && b <= 31) return true;
	return false;
}

/** Only call for hosts that contain ':' (IPv6 literals). */
function isBlockedIpv6(host: string): boolean {
	if (!host.includes(":")) return false;
	const h = host.toLowerCase();
	if (h === "::" || h === "::1") return true;
	// IPv4-mapped :ffff:a.b.c.d or :ffff:7f00:1
	const mappedDot = h.match(/:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
	if (mappedDot?.[1] && isBlockedIpv4(mappedDot[1])) return true;
	const mappedHex = h.match(/:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
	if (mappedHex) {
		const hi = Number.parseInt(mappedHex[1] ?? "0", 16);
		const lo = Number.parseInt(mappedHex[2] ?? "0", 16);
		const a = (hi >> 8) & 0xff;
		const b = hi & 0xff;
		const c = (lo >> 8) & 0xff;
		const d = lo & 0xff;
		if (isBlockedIpv4(`${a}.${b}.${c}.${d}`)) return true;
	}
	// ULA fc00::/7, link-local fe80::/10 — only on IPv6 literals
	const first = h.split(":")[0] ?? "";
	if (/^f[cd][0-9a-f]{0,2}$/i.test(first)) return true;
	if (/^fe[89ab][0-9a-f]?$/i.test(first)) return true;
	return false;
}

function isBlockedHost(host: string): boolean {
	if (
		host === "localhost" ||
		host === "0.0.0.0" ||
		host === "127.0.0.1" ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		host.endsWith(".localhost")
	) {
		return true;
	}
	if (isBlockedIpv4(host)) return true;
	if (host.includes(":") && isBlockedIpv6(host)) return true;
	return false;
}

/** Stream-read response body up to maxBytes (cancels remainder). */
export async function readResponseBounded(res: Response, maxBytes: number): Promise<string> {
	if (!res.body) return "";
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value?.byteLength) continue;
			const room = maxBytes - total;
			if (room <= 0) {
				await reader.cancel().catch(() => {});
				break;
			}
			if (value.byteLength <= room) {
				chunks.push(value);
				total += value.byteLength;
			} else {
				chunks.push(value.slice(0, room));
				total += room;
				await reader.cancel().catch(() => {});
				break;
			}
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			/* ignore */
		}
	}
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.byteLength;
	}
	return new TextDecoder().decode(out);
}
