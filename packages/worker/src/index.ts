import { Hono } from "hono";
import { assertBootEnv } from "./lib/env.js";
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

app.get("/api/live", liveRoute);

app.use("/api/*", accessAuth);
app.get("/api/me", meRoute);

app.get("/", (c) => c.text("xray worker ok"));

export default app;
