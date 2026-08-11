export type ZhetoSaveState = "idle" | "saving" | "saved" | "error";

export function canSaveToZheto(url: string | null | undefined): url is string {
	if (!url || typeof url !== "string") return false;
	try {
		const u = new URL(url);
		return u.protocol === "https:";
	} catch {
		return false;
	}
}

/** Derive https URL for x.com status id. */
export function xStatusUrl(tweetId: string): string {
	return `https://x.com/i/status/${tweetId}`;
}

export async function postZhetoSave(input: {
	url: string;
	note?: string;
	folder?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const res = await fetch("/api/integrations/zheto/save", {
			method: "POST",
			headers: { "content-type": "application/json" },
			credentials: "include",
			body: JSON.stringify(input),
		});
		if (!res.ok) {
			const t = await res.text().catch(() => "");
			return { ok: false, error: t.slice(0, 200) || res.statusText };
		}
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
