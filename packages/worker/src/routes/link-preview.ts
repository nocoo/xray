import { extractArticleLinks, type LinkPreview } from "@xray/shared";
import type { Context } from "hono";
import { jsonErr, jsonOk, parseIdParam, requireUser } from "../lib/http.js";
import { fetchLinkPreview, previewCacheKey, unavailablePreview } from "../lib/link-preview.js";
import { publicPreviewUrl } from "../lib/link-preview-url.js";
import { getChannel, getChannelArticle } from "../repos/channels.js";
import type { AppEnv } from "../types.js";

export async function articleLinkPreviewRoute(c: Context<AppEnv>): Promise<Response> {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	c.header("Cache-Control", "private, no-store");
	const channelId = parseIdParam(c.req.param("id"));
	const articleId = parseIdParam(c.req.param("articleId"));
	if (!channelId || !articleId) return jsonErr(c, "invalid id", 400);
	if (!(await getChannel(c.env.DB, user.id, channelId))) return jsonErr(c, "Not found", 404);
	const article = await getChannelArticle(c.env.DB, user.id, channelId, articleId);
	if (!article) return jsonErr(c, "Not found", 404);
	const raw = c.req.query("url");
	if (!raw || raw.length > 4096 || !URL.canParse(raw)) return jsonErr(c, "invalid url", 400);
	const normalized = new URL(raw);
	normalized.hash = "";
	if (!extractArticleLinks(article.markdown).some((link) => link.url === normalized.href))
		return jsonErr(c, "URL is not an article link", 400);
	const url = publicPreviewUrl(normalized.href);
	if (!url) return jsonOk(c, unavailablePreview(normalized.href));
	const key = await previewCacheKey(user.id, normalized.href);
	let cached: Response | undefined;
	try {
		cached = await caches.default.match(key);
	} catch {
		/* Cache failure must not block reading. */
	}
	if (cached) return jsonOk(c, await cached.json<LinkPreview>());
	const preview = await fetchLinkPreview(normalized.href);
	c.executionCtx.waitUntil(
		caches.default
			.put(
				key,
				new Response(JSON.stringify(preview), {
					headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
				}),
			)
			.catch(() => {}),
	);
	return jsonOk(c, preview);
}
