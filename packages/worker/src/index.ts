import { Hono } from "hono";
import { assertBootEnv } from "./lib/env.js";
import { classifyHost } from "./lib/hosts.js";
import { accessAuth } from "./middleware/access-auth.js";
import { liveRoute } from "./routes/live.js";
import { meRoute } from "./routes/me.js";
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

// Host + auth for all /api/* (live is public only on allowed hosts)
app.use("/api/*", accessAuth);
app.get("/api/live", liveRoute);
app.get("/api/me", meRoute);

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
	return assets.fetch(c.req.raw);
});

export default app;
