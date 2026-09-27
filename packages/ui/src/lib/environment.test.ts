import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { LocalEnvironment } from "./environment";

const ready: LocalEnvironment = {
	local: true,
	mode: "demo",
	locked: false,
	automated: false,
	instanceId: "demo-one",
	csrfToken: "csrf-one",
	ingestBase: "http://127.0.0.1:42001/",
};
const unselected = { ...ready, mode: null, instanceId: null, ingestBase: null };
const key = "xray:environment-mode";

beforeEach(() => {
	vi.resetModules();
	window.__XRAY_LOCAL__ = true;
	localStorage.clear();
});
afterEach(() => {
	delete window.__XRAY_LOCAL__;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
function responses(...values: unknown[]) {
	const fetcher = vi.fn();
	for (const value of values) fetcher.mockResolvedValueOnce(Response.json(value));
	vi.stubGlobal("fetch", fetcher);
	return fetcher;
}

test.each([undefined, false])(
	"hosted capability %s ignores storage, build flags and URL preferences",
	async (marker) => {
		window.__XRAY_LOCAL__ = marker;
		localStorage.setItem(key, "prod");
		const read = vi.spyOn(Storage.prototype, "getItem");
		const fetcher = responses();
		const env = await import("./environment");
		await env.initializeEnvironment();
		expect(fetcher).not.toHaveBeenCalled();
		expect(read).not.toHaveBeenCalled();
		expect(env.getEnvironment()).toBeNull();
		expect(env.apiPath("/api/me")).toBe("/api/me");
		expect(env.environmentScope()).toBe("hosted");
		expect(env.ingestBase()).toBe("https://xray-ingest.worker.hexly.ai");
		expect(await env.selectEnvironment("demo", vi.fn())).toBe(false);
	},
);

test.each([null, "", "invalid", "mock", '"prod"', "https://elsewhere.test"])(
	"invalid preference %s selects Demo only after acceptance",
	async (stored) => {
		if (stored !== null) localStorage.setItem(key, stored);
		const fetcher = responses(unselected, ready);
		const env = await import("./environment");
		expect(() => env.apiPath("/api/me")).toThrow("not initialized");
		expect(() => env.ingestBase()).toThrow("not initialized");
		await Promise.all([env.initializeEnvironment(), env.initializeEnvironment()]);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher).toHaveBeenNthCalledWith(1, "/__local/environment", {
			credentials: "same-origin",
		});
		expect(fetcher).toHaveBeenNthCalledWith(2, "/__local/environment/select", {
			credentials: "same-origin",
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Xray-Local-Csrf": "csrf-one" },
			body: JSON.stringify({ mode: "demo", instanceId: null }),
		});
		expect(localStorage.getItem(key)).toBe("demo");
		expect(env.apiPath("/api/me")).toBe("/__local/instances/demo-one/api/me");
		expect(env.ingestBase()).toBe("http://127.0.0.1:42001");
		expect(Object.isFrozen(env.getEnvironment())).toBe(true);
	},
);

test.each(["demo", "e2e", "prod"] as const)(
	"valid %s preference starts a newly accepted instance",
	async (mode) => {
		localStorage.setItem(key, mode);
		const fetcher = responses(unselected, {
			...ready,
			mode,
			instanceId: "new-run",
			locked: false,
		});
		const env = await import("./environment");
		await env.initializeEnvironment();
		expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({ mode, instanceId: null });
		expect(env.environmentScope()).toBe("instance:new-run");
	},
);

test.each([
	{ mode: "prod", automated: false, locked: false, local: true },
	{ mode: "e2e", automated: true, locked: true, local: true },
	{ mode: "e2e", automated: true, locked: true, local: false },
] as const)("launcher target takes priority and does not touch preferences: %j", async (flags) => {
	localStorage.setItem(key, "demo");
	const read = vi.spyOn(Storage.prototype, "getItem");
	const write = vi.spyOn(Storage.prototype, "setItem");
	const fetcher = responses({ ...ready, ...flags });
	const env = await import("./environment");
	await env.initializeEnvironment();
	expect(read).not.toHaveBeenCalled();
	expect(write).not.toHaveBeenCalled();
	expect(env.getEnvironment()?.mode).toBe(flags.mode);
	expect(env.apiPath("/api/me")).toBe("/__local/instances/demo-one/api/me");
	if (flags.locked) {
		for (const mode of ["demo", "prod", "e2e"])
			expect(await env.selectEnvironment(mode, vi.fn())).toBe(false);
	}
	expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
	"unselected automated launcher (local %s) never reads or writes interactive preferences",
	async (local) => {
		const read = vi.spyOn(Storage.prototype, "getItem");
		const write = vi.spyOn(Storage.prototype, "setItem");
		responses(
			{ ...unselected, local, automated: true },
			{ ...ready, local, automated: true, locked: true, mode: "e2e" },
		);
		const env = await import("./environment");
		await env.initializeEnvironment();
		expect(read).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
	},
);

test("unavailable storage cannot prevent initialization or acceptance", async () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw Error("denied");
	});
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw Error("denied");
	});
	responses(unselected, ready, { ...ready, mode: "prod", instanceId: "prod-one" });
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const env = await import("./environment");
	await env.initializeEnvironment();
	expect(await env.selectEnvironment("prod", vi.fn())).toBe(true);
	expect(navigate).toHaveBeenCalledWith("/");
});

test("accepted switch persists only enum and keeps API, media, ingest and pending writes bound to original instance", async () => {
	const fetcher = responses(
		ready,
		{ ...ready, mode: "prod", instanceId: "prod-two", ingestBase: "https://production.test" },
		{ success: true, data: { ok: true } },
	);
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const env = await import("./environment");
	await env.initializeEnvironment();
	const original = env.apiPath("/api/channels/1");
	localStorage.setItem(key, "e2e");
	window.dispatchEvent(new StorageEvent("storage", { key, newValue: "e2e" }));
	expect(env.apiPath("/api/channels/1")).toBe(original);
	expect(await env.selectEnvironment("prod", vi.fn())).toBe(true);
	expect(localStorage.getItem(key)).toBe("prod");
	expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({
		mode: "prod",
		instanceId: "demo-one",
	});
	expect(env.apiPath("/api/media/proxy?url=x")).toBe(
		"/__local/instances/demo-one/api/media/proxy?url=x",
	);
	expect(env.ingestBase()).toBe("http://127.0.0.1:42001");
	expect(navigate).toHaveBeenCalledWith("/");
	const { apiPatch } = await import("@/api/client");
	await apiPatch("/api/channels/1", { name: "old draft" });
	expect(fetcher.mock.lastCall?.[0]).toBe(original);
});

test("cancelled dirty switch leaves drafts, target, cache scope and preference intact", async () => {
	const fetcher = responses(ready);
	localStorage.setItem(key, "demo");
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const env = await import("./environment");
	const drafts = await import("./unsaved-drafts");
	await env.initializeEnvironment();
	const release = drafts.trackUnsavedDraft();
	const confirm = vi.fn().mockResolvedValue(false);
	expect(await env.selectEnvironment("prod", confirm)).toBe(false);
	expect(confirm).toHaveBeenCalledOnce();
	expect(fetcher).toHaveBeenCalledOnce();
	expect(navigate).not.toHaveBeenCalled();
	expect(localStorage.getItem(key)).toBe("demo");
	expect(drafts.hasUnsavedDrafts()).toBe(true);
	expect(env.environmentScope()).toBe("instance:demo-one");
	const event = new Event("beforeunload", { cancelable: true });
	drafts.preventDraftUnload(event as BeforeUnloadEvent);
	expect(event.defaultPrevented).toBe(true);
	release();
});

test("discard confirmation runs before selection, serializes switches, and avoids a second unload prompt", async () => {
	const fetcher = responses(ready, { ...ready, mode: "e2e", locked: false, instanceId: "e2e-new" });
	vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const env = await import("./environment");
	const drafts = await import("./unsaved-drafts");
	await env.initializeEnvironment();
	const release = drafts.trackUnsavedDraft();
	let answer!: (yes: boolean) => void;
	const switchRun = env.selectEnvironment(
		"e2e",
		() =>
			new Promise((resolve) => {
				answer = resolve;
			}),
	);
	expect(fetcher).toHaveBeenCalledOnce();
	expect(await env.selectEnvironment("prod", vi.fn())).toBe(false);
	answer(true);
	expect(await switchRun).toBe(true);
	const event = new Event("beforeunload", { cancelable: true });
	drafts.preventDraftUnload(event as BeforeUnloadEvent);
	expect(event.defaultPrevented).toBe(false);
	release();
});

test("failed selections retain preference, active target and dirty guard and can be retried", async () => {
	const fetcher = responses(ready);
	fetcher.mockResolvedValueOnce(new Response(null, { status: 409 }));
	fetcher.mockResolvedValueOnce(Response.json({ ...ready, mode: "prod", instanceId: "new" }));
	vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const env = await import("./environment");
	await env.initializeEnvironment();
	const drafts = await import("./unsaved-drafts");
	const release = drafts.trackUnsavedDraft();
	await expect(env.selectEnvironment("prod", async () => true)).rejects.toThrow("409");
	expect(localStorage.getItem(key)).toBeNull();
	expect(drafts.hasUnsavedDrafts()).toBe(true);
	expect(env.getEnvironment()?.instanceId).toBe("demo-one");
	expect(await env.selectEnvironment("invalid", vi.fn())).toBe(false);
	expect(await env.selectEnvironment("demo", vi.fn())).toBe(false);
	expect(await env.selectEnvironment("prod", async () => true)).toBe(true);
	release();
});

test("server mode mismatch fails closed", async () => {
	responses(unselected, { ...ready, mode: "prod" });
	const env = await import("./environment");
	await expect(env.initializeEnvironment()).rejects.toThrow("not accepted");
	expect(localStorage.getItem(key)).toBeNull();
	expect(() => env.apiPath("/api/me")).toThrow("not initialized");
});

test.each([
	null,
	{},
	{ ...ready, local: "true" },
	{ ...ready, locked: null },
	{ ...ready, automated: null },
	{ ...ready, csrfToken: "" },
	{ ...ready, mode: "mock" },
	{ ...ready, locked: true },
	{ ...ready, instanceId: null },
	{ ...ready, instanceId: "../prod" },
	{ ...ready, ingestBase: null },
])("malformed descriptor fails closed: %j", async (value) => {
	responses(value);
	const env = await import("./environment");
	await expect(env.initializeEnvironment()).rejects.toThrow("Invalid local environment");
	expect(() => env.apiPath("/api/me")).toThrow("not initialized");
});

test("reader caches isolate identity and each instance, even repeated Demo sessions", async () => {
	responses(ready);
	const env = await import("./environment");
	await env.initializeEnvironment();
	const reader = await import("./channel-reader");
	const oldKey = reader.readerStorageKey("owner");
	sessionStorage.setItem(oldKey, "600");
	expect(oldKey).not.toBe(reader.readerStorageKey("other"));
	expect(reader.ingestEndpoint()).toBe("http://127.0.0.1:42001/api/v1/ingest/articles");
	vi.resetModules();
	responses({ ...ready, instanceId: "demo-two" });
	await (await import("./environment")).initializeEnvironment();
	const newReader = await import("./channel-reader");
	expect(newReader.readerStorageKey("owner")).not.toBe(oldKey);
	expect(newReader.readPosition(sessionStorage, newReader.readerStorageKey("owner"))).toBe(0);
});
