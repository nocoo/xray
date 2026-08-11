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

	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (isBlockedHost(host)) return { ok: false, error: "baseUrl host not allowed" };

	const base = `${u.origin}${u.pathname}`.replace(/\/$/, "");
	return { ok: true, base, chatCompletionsUrl: `${base}/chat/completions` };
}

function isBlockedHost(host: string): boolean {
	if (
		host === "localhost" ||
		host === "0.0.0.0" ||
		host === "::1" ||
		host === "127.0.0.1" ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		host.endsWith(".localhost")
	) {
		return true;
	}
	// IPv4
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
		const parts = host.split(".").map(Number);
		const [a, b] = parts;
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 192 && b === 168) return true;
		if (a === 172 && b != null && b >= 16 && b <= 31) return true;
	}
	// IPv6 compressed forms we care about
	if (host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
		return true;
	}
	// expand common ::ffff:127.0.0.1
	if (host.includes("::ffff:")) {
		const v4 = host.split("::ffff:")[1];
		if (v4 && isBlockedHost(v4)) return true;
	}
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
