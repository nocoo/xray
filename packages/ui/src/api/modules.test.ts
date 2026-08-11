import { afterEach, describe, test, vi } from "vitest";
import * as ai from "./ai";
import * as dashboard from "./dashboard";
import * as groups from "./groups";
import * as me from "./me";
import * as settings from "./settings";
import * as tokens from "./tokens";
import * as watchlists from "./watchlists";
import * as zheto from "./zheto";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function okData<T>(data: T) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, data }),
		}),
	);
}

describe("api modules hit real client", () => {
	test("watchlists + groups + tokens + settings + dashboard + me + ai + zheto", async () => {
		okData([]);
		await watchlists.fetchWatchlists();
		await groups.fetchGroups();
		await tokens.fetchPushTokens();
		await me.fetchMe();

		okData({ id: 1 });
		await watchlists.createWatchlist({ name: "n" });
		await watchlists.fetchWatchlist(1);
		await watchlists.updateWatchlist(1, { name: "n2" });
		await watchlists.deleteWatchlist(1);
		await watchlists.fetchMembers(1);
		await watchlists.addMember(1, { sourceType: "x.com", handle: "a" });
		await watchlists.patchMember(1, 2, { note: "n" });
		await watchlists.deleteMember(1, 2);
		await watchlists.fetchItems(1, { limit: 10, source_type: "x.com", cursor: "c" });
		await watchlists.fetchItems(1);
		await watchlists.fetchItems(1, { limit: 5 });
		await watchlists.fetchItems(1, { source_type: "custom" });
		await watchlists.fetchItems(1, { cursor: "n" });
		await watchlists.fetchTags();
		await watchlists.createTag("t", "#fff");
		await watchlists.fetchWatchlistIngestLogs(1, 5);
		await watchlists.fetchWatchlistIngestLogs(1);

		await groups.createGroup({ name: "g" });
		await groups.updateGroup(1, { name: "g2" });
		await groups.deleteGroup(1);
		await groups.fetchGroupMembers(1);
		await groups.addGroupMember(1, { sourceType: "x.com", handle: "b" });
		await groups.deleteGroupMember(1, 2);
		await groups.bulkImportGroupMembers(1, "@x");
		await groups.copyGroupToWatchlist(1, { watchlistId: 3 });

		await tokens.createPushToken("l");
		await tokens.revokePushToken(9);

		okData({
			email: "a@b.c",
			name: null,
			image: null,
			ingest: { windowHours: 24 },
		});
		await settings.fetchSettings();
		await settings.patchSettings(12);

		okData({
			watchlistCount: 0,
			groupCount: 0,
			memberCount: 0,
			items24h: 0,
			pendingAi: 0,
			bySourceType: [],
			recentIngestLogs: [],
		});
		await dashboard.fetchDashboard();

		okData({ configured: false });
		await ai.fetchAiConfig();
		okData({
			provider: "openai",
			model: null,
			baseUrl: null,
			apiKeyMasked: "",
			hasApiKey: false,
			apiKeyKeyVersion: 1,
			translationPrompt: null,
			summaryPrompt: null,
			updatedAtMs: 1,
		});
		await ai.saveAiConfig({ provider: "openai" });
		okData({ ok: true });
		await ai.testAiConfig();
		okData({ results: [], timed_out: false });
		await ai.translateWatchlist(1, { limit: 1 });

		okData({
			configured: true,
			webhookUrlMasked: "…",
			folder: null,
			updatedAtMs: 1,
		});
		await zheto.fetchZhetoSettings();
		await zheto.saveZhetoSettings({ folder: "f" });
		okData({ shortUrl: null, slug: null, originalUrl: "u", isExisting: false });
		await zheto.zhetoSave({ url: "https://x.com" });
	});
});
