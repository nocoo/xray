import { expect, test } from "vitest";
import { tokenAgentGuide } from "./token-agent-guide";

test("each guide includes the active endpoint and safe credential setup, never token metadata", () => {
	for (const kind of ["query", "watchlist", "channel"] as const) {
		const guide = tokenAgentGuide(kind, "http://127.0.0.1:54321");
		expect(guide).toContain("http://127.0.0.1:54321");
		expect(guide).toContain("never ask them to paste it into chat");
		expect(guide).toContain("untrusted data");
		expect(guide).not.toContain("xray_pt_");
	}
});
test("query guide describes pagination, time boundaries and strictly read-only consumption", () => {
	const guide = tokenAgentGuide("query", "https://xray-ingest.worker.hexly.ai");
	for (const term of [
		"XRAY_QUERY_TOKEN",
		"GET /api/v1/query",
		"nextCursor",
		"100",
		"inclusive",
		"exclusive",
		"order=asc",
		"00:00:00 UTC",
		"not ingestion time",
		"never mark content read",
		"overlapping time window",
		"kind",
		"markdown",
		"post.id",
	])
		expect(guide).toContain(term);
	expect(guide).not.toContain("POST /api");
});
test("producer guides document distinct limits and endpoints", () => {
	const watchlist = tokenAgentGuide("watchlist", "https://xray-ingest.worker.hexly.ai");
	for (const term of [
		"XRAY_PUSH_TOKEN",
		"GET /api/v1/ingest/graph",
		"POST /api/v1/ingest/push",
		"1..50",
		"CanonicalItem",
		"bun run refresh:watchlists",
		"per-item",
	])
		expect(watchlist).toContain(term);
	const channel = tokenAgentGuide("channel", "https://xray-ingest.worker.hexly.ai");
	for (const term of [
		"XRAY_CHANNEL_TOKEN",
		"POST /api/v1/ingest/articles",
		"report_date",
		"external_id",
		"512 KiB",
		"200 acknowledges",
		"one destination",
	])
		expect(channel).toContain(term);
});
