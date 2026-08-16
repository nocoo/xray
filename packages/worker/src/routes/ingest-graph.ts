import type { Context } from "hono";
import { requirePushToken, touchPushToken } from "../lib/push-token-auth.js";
import { listMembers } from "../repos/members.js";
import { listWatchlists } from "../repos/watchlists.js";
import type { AppEnv } from "../types.js";

export async function ingestGraphRoute(c: Context<AppEnv>) {
	const auth = await requirePushToken(c, "ingest:read");
	if (auth instanceof Response) return auth;

	const lists = await listWatchlists(c.env.DB, auth.user.id);
	const watchlists = [];
	for (const wl of lists) {
		const members = await listMembers(c.env.DB, auth.user.id, wl.id);
		watchlists.push({
			id: wl.id,
			name: wl.name,
			members: members
				.filter((m) => m.sourceType === "x.com")
				.map((m) => ({ handle: m.handle, sourceType: "x.com" as const })),
		});
	}

	await touchPushToken(c.env.DB, auth.tokenId);
	return c.json({ watchlists });
}
