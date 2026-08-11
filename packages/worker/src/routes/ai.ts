import type { Context } from "hono";
import { jsonErr, jsonOk, requireUser } from "../lib/http.js";
import {
	AiConfigValidationError,
	decryptAiApiKey,
	getAiConfig,
	getAiConfigRow,
	upsertAiConfig,
} from "../repos/ai-configs.js";
import type { AppEnv } from "../types.js";

export async function getAiConfigRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const data = await getAiConfig(c.env.DB, user.id);
	return jsonOk(c, data ?? { configured: false });
}

export async function putAiConfigRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const raw = await c.req.json().catch(() => null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return jsonErr(c, "invalid body", 400);
	}
	const body = raw as Record<string, unknown>;
	if (typeof body.provider !== "string" || !body.provider.trim()) {
		return jsonErr(c, "provider required", 400);
	}
	try {
		const data = await upsertAiConfig(
			c.env.DB,
			user.id,
			{
				provider: body.provider,
				model: typeof body.model === "string" ? body.model : body.model === null ? null : undefined,
				baseUrl:
					typeof body.baseUrl === "string"
						? body.baseUrl
						: body.baseUrl === null
							? null
							: undefined,
				apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
				translationPrompt:
					typeof body.translationPrompt === "string"
						? body.translationPrompt
						: body.translationPrompt === null
							? null
							: undefined,
				summaryPrompt:
					typeof body.summaryPrompt === "string"
						? body.summaryPrompt
						: body.summaryPrompt === null
							? null
							: undefined,
			},
			c.env,
		);
		return jsonOk(c, data);
	} catch (e) {
		if (e instanceof AiConfigValidationError) return jsonErr(c, e.message, 400);
		if (e instanceof Error && /KEK/i.test(e.message)) {
			return jsonErr(c, "secrets KEK not configured", 500);
		}
		throw e;
	}
}

const AI_TEST_TIMEOUT_MS = 12_000;
const AI_TEST_BODY_MAX = 8_192;

function resolveTestBaseUrl(
	raw: string | null | undefined,
): { ok: true; base: string } | { ok: false; error: string } {
	const base = (raw?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
	let u: URL;
	try {
		u = new URL(base.includes("://") ? base : `https://${base}`);
	} catch {
		return { ok: false, error: "invalid baseUrl" };
	}
	if (u.protocol !== "https:") return { ok: false, error: "baseUrl must be https" };
	const host = u.hostname.toLowerCase();
	if (
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "0.0.0.0" ||
		host === "::1" ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		/^10\./.test(host) ||
		/^192\.168\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
		host.startsWith("169.254.")
	) {
		return { ok: false, error: "baseUrl host not allowed" };
	}
	return { ok: true, base: `${u.origin}${u.pathname}`.replace(/\/$/, "") };
}

async function readBoundedText(res: Response, max = AI_TEST_BODY_MAX): Promise<string> {
	const buf = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
	const bytes = new Uint8Array(buf).slice(0, max);
	return new TextDecoder().decode(bytes);
}

/** POST /api/ai-config/test — lightweight chat completion ping (saved config or draft body). */
export async function testAiConfigRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;

	const raw = await c.req.json().catch(() => ({}));
	const draft =
		raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

	const row = await getAiConfigRow(c.env.DB, user.id);
	const provider =
		typeof draft.provider === "string" && draft.provider.trim()
			? draft.provider.trim()
			: (row?.provider ?? "");
	const model = typeof draft.model === "string" ? draft.model.trim() || null : (row?.model ?? null);
	const baseUrlRaw = typeof draft.baseUrl === "string" ? draft.baseUrl : (row?.base_url ?? null);

	let apiKey: string | null = null;
	if (typeof draft.apiKey === "string" && draft.apiKey.trim()) {
		apiKey = draft.apiKey.trim();
	} else if (row) {
		try {
			apiKey = (await decryptAiApiKey(row, c.env)).apiKey;
		} catch {
			return jsonErr(c, "failed to decrypt API key", 500);
		}
	}
	if (!provider) return jsonErr(c, "AI not configured", 400);
	if (!apiKey) return jsonErr(c, "API key required (save config or pass apiKey in body)", 400);

	const base = resolveTestBaseUrl(baseUrlRaw);
	if (!base.ok) return jsonOk(c, { ok: false, error: base.error });
	const endpoint = `${base.base}/chat/completions`;

	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), AI_TEST_TIMEOUT_MS);
	try {
		const res = await fetch(endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: model || "gpt-4o-mini",
				messages: [
					{ role: "system", content: "Reply with the single word: ok" },
					{ role: "user", content: "ping" },
				],
				max_tokens: 8,
				temperature: 0,
			}),
			signal: ac.signal,
		});
		const bodyText = await readBoundedText(res);
		if (!res.ok) {
			return jsonOk(c, {
				ok: false,
				status: res.status,
				error: bodyText.slice(0, 300) || res.statusText,
			});
		}
		let parsed: { choices?: Array<{ message?: { content?: string } }> };
		try {
			parsed = JSON.parse(bodyText) as typeof parsed;
		} catch {
			return jsonOk(c, { ok: false, status: res.status, error: "upstream response is not JSON" });
		}
		const content = parsed.choices?.[0]?.message?.content?.trim();
		if (!content) {
			return jsonOk(c, {
				ok: false,
				status: res.status,
				error: "upstream JSON missing choices[0].message.content",
			});
		}
		return jsonOk(c, { ok: true, status: res.status, provider, model });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return jsonOk(c, { ok: false, error: /abort/i.test(msg) ? "timeout" : msg });
	} finally {
		clearTimeout(timer);
	}
}
