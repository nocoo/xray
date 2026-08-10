import { Hono } from "hono";
import { assertBootEnv } from "./lib/env.js";
import { classifyHost } from "./lib/hosts.js";
import { accessAuth } from "./middleware/access-auth.js";
import {
	addGroupMemberRoute,
	createGroupRoute,
	deleteGroupMemberRoute,
	deleteGroupRoute,
	getGroupRoute,
	listGroupMembersRoute,
	listGroupsRoute,
	patchGroupRoute,
} from "./routes/groups.js";
import { ingestPushRoute } from "./routes/ingest-push.js";
import { deleteItemRoute, listItemsRoute } from "./routes/items.js";
import { liveRoute } from "./routes/live.js";
import { meRoute } from "./routes/me.js";
import { getSettingsRoute, patchSettingsRoute } from "./routes/settings.js";
import { createTokenRoute, listTokensRoute, revokeTokenRoute } from "./routes/tokens.js";
import {
	addMemberRoute,
	createTagRoute,
	createWatchlistRoute,
	deleteMemberRoute,
	deleteWatchlistRoute,
	getWatchlistRoute,
	listMembersRoute,
	listTagsRoute,
	listWatchlistsRoute,
	patchMemberRoute,
	patchWatchlistRoute,
} from "./routes/watchlists.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
	try {
		assertBootEnv(c.env);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return c.json({ error: msg }, 500);
	}
	return next();
});

// Host guard for non-API (SPA) — ingest/unknown never get assets
app.use("*", async (c, next) => {
	const path = c.req.path;
	if (path.startsWith("/api/")) return next();

	const kind = classifyHost(c.req.header("host") || "");
	if (kind === "ingest" || kind === "unknown") {
		return c.json({ error: "Not found" }, 404);
	}
	return next();
});

// Host + auth for all /api/* (live public; ingest push uses Bearer)
app.use("/api/*", accessAuth);

app.get("/api/live", liveRoute);
app.get("/api/me", meRoute);

app.get("/api/watchlists", listWatchlistsRoute);
app.post("/api/watchlists", createWatchlistRoute);
app.get("/api/watchlists/:id", getWatchlistRoute);
app.patch("/api/watchlists/:id", patchWatchlistRoute);
app.delete("/api/watchlists/:id", deleteWatchlistRoute);
app.get("/api/watchlists/:id/members", listMembersRoute);
app.post("/api/watchlists/:id/members", addMemberRoute);
app.patch("/api/watchlists/:id/members/:memberId", patchMemberRoute);
app.delete("/api/watchlists/:id/members/:memberId", deleteMemberRoute);
app.get("/api/watchlists/:id/items", listItemsRoute);
app.delete("/api/items/:itemId", deleteItemRoute);

app.get("/api/tags", listTagsRoute);
app.post("/api/tags", createTagRoute);

app.get("/api/groups", listGroupsRoute);
app.post("/api/groups", createGroupRoute);
app.get("/api/groups/:id", getGroupRoute);
app.patch("/api/groups/:id", patchGroupRoute);
app.delete("/api/groups/:id", deleteGroupRoute);
app.get("/api/groups/:id/members", listGroupMembersRoute);
app.post("/api/groups/:id/members", addGroupMemberRoute);
app.delete("/api/groups/:id/members/:memberId", deleteGroupMemberRoute);

app.get("/api/settings", getSettingsRoute);
app.patch("/api/settings", patchSettingsRoute);

app.get("/api/push-tokens", listTokensRoute);
app.post("/api/push-tokens", createTokenRoute);
app.delete("/api/push-tokens/:id", revokeTokenRoute);

app.post("/api/v1/ingest/push", ingestPushRoute);

// Browser/local SPA via ASSETS binding
app.all("*", async (c) => {
	const kind = classifyHost(c.req.header("host") || "");
	if (kind === "ingest" || kind === "unknown") {
		return c.json({ error: "Not found" }, 404);
	}
	const assets = c.env.ASSETS;
	if (!assets) {
		return c.text("xray worker ok (no ASSETS binding)", 200);
	}
	const res = await assets.fetch(c.req.raw);
	if (res.status === 404 && c.req.method === "GET") {
		const accept = c.req.header("accept") || "";
		if (accept.includes("text/html") || accept === "" || accept.includes("*/*")) {
			const indexUrl = new URL("/index.html", c.req.url);
			const indexRes = await assets.fetch(new Request(indexUrl.toString(), c.req.raw));
			if (indexRes.ok) return indexRes;
		}
	}
	return res;
});

export default app;
