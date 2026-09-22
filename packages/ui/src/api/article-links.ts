import type { LinkPreview } from "@xray/shared";
import { apiGet } from "./client";

export function fetchArticleLinkPreview(
	channelId: number,
	articleId: number,
	url: string,
	signal: AbortSignal,
): Promise<LinkPreview> {
	const query = new URLSearchParams({ url });
	return apiGet<LinkPreview>(
		`/api/channels/${channelId}/articles/${articleId}/link-preview?${query}`,
		signal,
	);
}
