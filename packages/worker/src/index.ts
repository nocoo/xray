import { Hono } from "hono";
import { liveRoute } from "./routes/live.js";

const app = new Hono();

app.get("/api/live", liveRoute);

app.get("/", (c) => c.text("xray worker ok"));

export default app;
