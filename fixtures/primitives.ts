import type { CanonicalCustomItem, CanonicalXItem } from "../packages/shared/src/canonical-item.js";

export const FIXTURE_ANCHOR_ISO = "2026-09-27T04:00:00.000Z";
export const FIXTURE_ANCHOR_MS = Date.parse(FIXTURE_ANCHOR_ISO);
export const FIXTURE_VERSION = 1;
export const DEMO_IDENTITY = {
	id: "xray-demo-user",
	iss: "https://identity.xray.test",
	sub: "demo-owner",
	email: "owner@xray.test",
	name: "Demo Owner",
} as const;
export const OTHER_IDENTITY = {
	id: "xray-demo-other",
	iss: DEMO_IDENTITY.iss,
	sub: "demo-other",
	email: "other@xray.test",
	name: "Other Owner",
} as const;

export const MEDIA_URLS = {
	desk: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80",
	landscape:
		"https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=960&q=80",
	avatar:
		"https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80",
	motion: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
} as const;
export const AI_BASE_URL = "https://api.openai.com/v1";
export const AI_MODEL = "xray-fixture";
export const ZHETO_WEBHOOK_URL =
	"https://zhe.to/api/link/create/00000000-0000-4000-8000-000000000001";

export function fixtureIdentity(runId: string, role: "owner" | "other" = "owner") {
	if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(runId)) throw new Error("Invalid fixture run ID");
	return {
		id: `xray-e2e-${runId}-${role}`,
		iss: DEMO_IDENTITY.iss,
		sub: `e2e-${runId}-${role}`,
		email: `${runId}-${role}@xray.test`,
		name: role === "owner" ? "Test Owner" : "Other Test Owner",
	};
}

export function canonicalPost(
	externalId = "fixture-post-1",
	text = "Keep the source beside the observation. A repeatable experiment starts with one clear question.",
): CanonicalXItem {
	return {
		source_type: "x.com",
		external_id: externalId,
		created_at: FIXTURE_ANCHOR_ISO,
		author: {
			id: "fixture-builder",
			username: "demo_builder",
			display_name: "Demo Builder",
			avatar_url: MEDIA_URLS.avatar,
		},
		body: {
			kind: "x.post",
			tweet: {
				id: externalId,
				text,
				author_id: "fixture-builder",
				created_at: FIXTURE_ANCHOR_ISO,
				lang: "en",
				public_metrics: { like_count: 42, reply_count: 3, retweet_count: 7 },
			},
		},
	};
}

export function canonicalArticle(
	externalId = "fixture-custom-1",
	text = "A compact reading queue makes room for the original source and a short note about why it matters.",
): CanonicalCustomItem {
	return {
		source_type: "custom",
		external_id: externalId,
		created_at: FIXTURE_ANCHOR_ISO,
		author: { username: "engineering-notes", display_name: "Engineering Notes" },
		body: {
			kind: "custom",
			title: "A quieter reading queue",
			text,
			url: "https://developers.cloudflare.com/workers/",
			tags: ["Reading", "Engineering"],
		},
	};
}
