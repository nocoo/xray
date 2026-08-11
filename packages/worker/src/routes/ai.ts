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

/** POST /api/ai-config/test — lightweight chat completion ping */
export async function testAiConfigRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const row = await getAiConfigRow(c.env.DB, user.id);
	if (!row) return jsonErr(c, "AI not configured", 400);
	let apiKey: string;
	try {
		const dec = await decryptAiApiKey(row, c.env);
		apiKey = dec.apiKey;
	} catch {
		return jsonErr(c, "failed to decrypt API key", 500);
	}
	const endpoint = `${(row.base_url || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;
	try {
		const res = await fetch(endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: row.model || "gpt-4o-mini",
				messages: [
					{ role: "system", content: "Reply with the single word: ok" },
					{ role: "user", content: "ping" },
				],
				max_tokens: 8,
				temperature: 0,
			}),
		});
		const bodyText = await res.text().catch(() => "");
		if (!res.ok) {
			return jsonOk(c, {
				ok: false,
				status: res.status,
				error: bodyText.slice(0, 300) || res.statusText,
			});
		}
		return jsonOk(c, { ok: true, status: res.status, provider: row.provider, model: row.model });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return jsonOk(c, { ok: false, error: msg });
	}
}
