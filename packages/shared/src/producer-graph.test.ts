import { describe, expect, test } from "vitest";
import {
	applyExplicitMembersFile,
	fetchIngestGraph,
	ingestAgentHeaders,
	ingestBaseForEnv,
} from "./producer-graph.js";

describe("ingestBaseForEnv", () => {
	test("dev vs prod vs explicit", () => {
		expect(ingestBaseForEnv("dev", undefined)).toBe("http://127.0.0.1:8787");
		expect(ingestBaseForEnv("prod", undefined)).toBe("https://xray-ingest.hexly.ai");
		expect(ingestBaseForEnv("dev", "https://xray-ingest.hexly.ai")).toBe(
			"https://xray-ingest.hexly.ai",
		);
	});
});

describe("ingestAgentHeaders", () => {
	test("spoils ingest host only for loopback", () => {
		expect(ingestAgentHeaders("http://127.0.0.1:8787", "tok").host).toBe("xray-ingest.hexly.ai");
		expect(ingestAgentHeaders("https://xray-ingest.hexly.ai", "tok").host).toBeUndefined();
	});
});

describe("fetchIngestGraph", () => {
	test("requires token", async () => {
		await expect(
			fetchIngestGraph({
				fetch: async () => ({ status: 200, ok: true, text: async () => "{}" }),
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "",
			}),
		).rejects.toThrow(/XRAY_PUSH_TOKEN/);
	});

	test("fail closed on 401/403/429/network/bad json", async () => {
		await expect(
			fetchIngestGraph({
				fetch: async () => ({ status: 401, ok: false, text: async () => "{}" }),
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			}),
		).rejects.toThrow(/401/);
		await expect(
			fetchIngestGraph({
				fetch: async () => ({ status: 403, ok: false, text: async () => "{}" }),
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			}),
		).rejects.toThrow(/403/);
		await expect(
			fetchIngestGraph({
				fetch: async () => ({ status: 429, ok: false, text: async () => "{}" }),
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			}),
		).rejects.toThrow(/429/);
		await expect(
			fetchIngestGraph({
				fetch: async () => {
					throw new Error("offline");
				},
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			}),
		).rejects.toThrow(/offline/);
		await expect(
			fetchIngestGraph({
				fetch: async () => ({ status: 200, ok: true, text: async () => "not-json" }),
				ingestBase: "https://xray-ingest.hexly.ai",
				pushToken: "tok",
			}),
		).rejects.toThrow(/invalid JSON/);
	});

	test("parses live 200 including empty", async () => {
		const empty = await fetchIngestGraph({
			fetch: async () => ({
				status: 200,
				ok: true,
				text: async () => JSON.stringify({ watchlists: [] }),
			}),
			ingestBase: "https://xray-ingest.hexly.ai",
			pushToken: "tok",
		});
		expect(empty).toEqual({ watchlists: [] });

		let seenUrl = "";
		let seenAuth = "";
		const g = await fetchIngestGraph({
			fetch: async (url, init) => {
				seenUrl = url;
				seenAuth = init.headers.authorization;
				return {
					status: 200,
					ok: true,
					text: async () =>
						JSON.stringify({
							watchlists: [
								{ id: 1, name: "AI", members: [{ handle: "sama", sourceType: "x.com" }] },
							],
						}),
				};
			},
			ingestBase: "https://xray-ingest.hexly.ai",
			pushToken: "xray_pt_x",
		});
		expect(seenUrl).toBe("https://xray-ingest.hexly.ai/api/v1/ingest/graph");
		expect(seenAuth).toBe("Bearer xray_pt_x");
		expect(g.watchlists[0]?.members[0]?.handle).toBe("sama");
	});
});

describe("applyExplicitMembersFile", () => {
	const live = {
		watchlists: [{ id: 1, name: "live", members: [{ handle: "a", sourceType: "x.com" as const }] }],
	};

	test("no path keeps live", () => {
		expect(applyExplicitMembersFile(live, undefined, { exists: () => true, read: () => "" })).toBe(
			live,
		);
	});

	test("missing file fails closed", () => {
		expect(() =>
			applyExplicitMembersFile(live, "/tmp/nope.json", { exists: () => false, read: () => "" }),
		).toThrow(/not found/);
	});

	test("existing file overrides after live", () => {
		const next = applyExplicitMembersFile(live, "/x.json", {
			exists: () => true,
			read: () =>
				JSON.stringify({
					watchlists: [{ id: 9, name: "file", members: [] }],
				}),
		});
		expect(next.watchlists[0]?.id).toBe(9);
	});
});
