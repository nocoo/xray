import type { LinkPreview } from "@xray/shared";
import { expect, test, vi } from "vitest";
import { createArticleLinksVm } from "./article-links-vm";

const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`);
const article = {
	id: 2,
	channelId: 1,
	markdown: urls.map((url, i) => `[Link ${i}](${url})`).join("\n\n"),
};
const metadata = (url: string): LinkPreview => ({
	url,
	title: "Preview",
	description: null,
	imageUrl: null,
	siteName: null,
});
function deferred() {
	let resolve!: (value: LinkPreview) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<LinkPreview>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

test("lists all bare links immediately, fetches only requested cards and caps concurrency at three", async () => {
	const pending = urls.map(() => deferred());
	let index = 0;
	const api = vi.fn(() => pending[index++].promise);
	const vm = createArticleLinksVm(api);
	vm.setArticle(article);
	expect(vm.getState().links).toHaveLength(5);
	expect(api).not.toHaveBeenCalled();
	vm.request("https://unknown.example/");
	for (const url of urls) {
		vm.request(url);
		vm.request(url);
	}
	expect(api).toHaveBeenCalledTimes(3);
	expect(vm.getState().links.map((link) => link.status)).toEqual([
		"loading",
		"loading",
		"loading",
		"queued",
		"queued",
	]);
	pending[0].resolve(metadata(urls[0]));
	await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(4));
	pending[1].reject(new Error("Blocked preview"));
	await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(5));
	expect(vm.getState().links[1]).toMatchObject({
		url: urls[1],
		label: "Link 1",
		status: "failed",
		preview: null,
	});
	pending[2].resolve(metadata(urls[2]));
	pending[3].resolve(metadata(urls[3]));
	pending[4].resolve(metadata(urls[4]));
	await vi.waitFor(() =>
		expect(vm.getState().links.filter((link) => link.status === "ready")).toHaveLength(4),
	);
	vm.request(urls[0]);
	vm.request(urls[1]);
	expect(api).toHaveBeenCalledTimes(5);
});

test("switching articles aborts requests, drops queued work and ignores late successes and failures", async () => {
	const pending = urls.map(() => deferred());
	let index = 0;
	const api = vi.fn(
		(_channel: number, _article: number, _url: string, _signal: AbortSignal) =>
			pending[index++].promise,
	);
	const vm = createArticleLinksVm(api);
	vm.setArticle(article);
	urls.forEach(vm.request);
	const signals = api.mock.calls.map((call) => call[3]);
	vm.setArticle({ ...article, id: 3, markdown: `[New](${urls[0]})` });
	expect(signals.every((signal) => signal.aborted)).toBe(true);
	vm.request(urls[0]);
	expect(api).toHaveBeenCalledTimes(4);
	pending[0].resolve(metadata(urls[0]));
	pending[1].reject(new Error("Late"));
	pending[2].resolve(metadata(urls[2]));
	pending[3].resolve({ ...metadata(urls[0]), title: "New article" });
	await vi.waitFor(() => expect(vm.getState().links[0].preview?.title).toBe("New article"));
	expect(vm.getState().links).toHaveLength(1);
	expect(api).toHaveBeenCalledTimes(4);
	vm.setArticle(article);
	expect(vm.getState().links[0].status).toBe("idle");
});

test("completed metadata is reused only by this VM and article identity; cancel blocks stale writes", async () => {
	const pending = deferred();
	const api = vi
		.fn()
		.mockResolvedValueOnce(metadata(urls[0]))
		.mockImplementationOnce(() => pending.promise);
	const vm = createArticleLinksVm(api);
	vm.setArticle(article);
	vm.request(urls[0]);
	await vi.waitFor(() => expect(vm.getState().links[0].status).toBe("ready"));
	vm.setArticle({ ...article, markdown: `[Renamed](${urls[0]})` });
	expect(vm.getState().links[0]).toMatchObject({ label: "Renamed", status: "ready" });
	vm.request(urls[0]);
	expect(api).toHaveBeenCalledTimes(1);
	vm.setArticle({ ...article, channelId: 8 });
	vm.request(urls[0]);
	vm.cancel();
	const snapshot = vm.getState();
	pending.resolve(metadata(urls[0]));
	await Promise.resolve();
	await Promise.resolve();
	expect(vm.getState()).toBe(snapshot);
	const other = createArticleLinksVm(api);
	other.setArticle(article);
	expect(other.getState().links[0].status).toBe("idle");
});

test("pre-extracted links bypass parsing and keep their labels", () => {
	const vm = createArticleLinksVm(vi.fn());
	vm.setArticle({ ...article, markdown: "No Markdown links here" }, [
		{ url: urls[0], label: "Already extracted" },
	]);
	expect(vm.getState().links).toEqual([
		{ url: urls[0], label: "Already extracted", status: "idle", preview: null },
	]);
});
