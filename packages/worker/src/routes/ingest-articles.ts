import { parseArticleInput } from "@xray/shared";
import type { Context } from "hono";
import { readBoundedBody } from "../lib/http.js";
import { requirePushToken, touchPushToken } from "../lib/push-token-auth.js";
import { getChannel, ingestChannelArticle } from "../repos/channels.js";
import type { AppEnv } from "../types.js";

const MAX_BODY_BYTES = 1_048_576;

/** POST /api/v1/ingest/articles — channel key (articles:write) report ingestion. */
export async function ingestArticlesRoute(c: Context<AppEnv>) {
	const cl = c.req.header("content-length");
	if (cl && Number(cl) > MAX_BODY_BYTES) {
		return c.json({ ok: false, error: "payload too large" }, 413);
	}

	const auth = await requirePushToken(c, "articles:write");
	if (auth instanceof Response) return auth;
	if (auth.channelId == null) {
		return c.json({ ok: false, error: "token not scoped to a channel" }, 403);
	}

	const channel = await getChannel(c.env.DB, auth.user.id, auth.channelId);
	if (!channel) return c.json({ ok: false, error: "channel not found" }, 404);

	const body = await readBoundedBody(c, MAX_BODY_BYTES);
	if (!body.ok) return c.json({ ok: false, error: body.error }, body.status);

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(body.text);
	} catch {
		return c.json({ ok: false, error: "invalid JSON" }, 400);
	}

	const input = parseArticleInput(parsedJson);
	if (!input.ok) return c.json({ ok: false, error: input.error }, input.status);

	const result = await ingestChannelArticle(
		c.env.DB,
		auth.user.id,
		channel.id,
		{ keyId: auth.tokenId, label: auth.label },
		input.value,
	);
	if (result.status === "conflict") {
		return c.json({ ok: false, error: "conflicting content for external_id" }, 409);
	}
	await touchPushToken(c.env.DB, auth.tokenId);

	const browserBase =
		(c.env.ENVIRONMENT || "").toLowerCase() === "production"
			? "https://xray.hexly.ai"
			: "https://xray.dev.hexly.ai";
	const url = `${browserBase}/channels/${channel.id}/articles/${result.article.id}`;
	return c.json(
		{
			id: result.article.id,
			channelId: channel.id,
			url,
			duplicate: result.status === "duplicate",
		},
		result.status === "created" ? 201 : 200,
	);
}
