import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ArticleLink, ChannelArticle, LinkPreview } from "@xray/shared";
import { afterEach, expect, test, vi } from "vitest";
import { fetchArticleLinkPreview } from "@/api/article-links";
import { ArticleLinksPanel } from "./article-links-panel";

vi.mock("@/api/article-links", () => ({ fetchArticleLinkPreview: vi.fn() }));
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});
const links: ArticleLink[] = [{ url: "https://example.com/report", label: "Source report" }];
const article: ChannelArticle = {
	id: 2,
	channelId: 1,
	markdown: "Provided links avoid a second extraction.",
	title: "Daily report",
	externalId: "daily",
	reportDate: "2026-09-22",
	summary: null,
	author: null,
	sourceLabel: "Agent",
	createdAtMs: 1,
	tags: [],
};
const preview: LinkPreview = {
	url: links[0].url,
	title: "Metadata title",
	description: "A short description",
	imageUrl: "https://example.com/cover.jpg",
	siteName: "Example",
};
function observers() {
	const instances: { show: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			disconnect = vi.fn();
			constructor(callback: IntersectionObserverCallback) {
				instances.push({
					disconnect: this.disconnect,
					show: () =>
						callback(
							[{ isIntersecting: true } as IntersectionObserverEntry],
							this as unknown as IntersectionObserver,
						),
				});
			}
			observe() {}
		},
	);
	return instances;
}

test("bare cards are usable before visibility; visible metadata enriches them and broken images disappear", async () => {
	const watching = observers();
	vi.mocked(fetchArticleLinkPreview).mockResolvedValue(preview);
	const view = render(<ArticleLinksPanel article={article} links={links} />);
	expect(screen.getByRole("region", { name: "Related links" })).toBeTruthy();
	const bare = screen.getByRole("link", { name: "Source report (opens in a new tab)" });
	expect(bare.getAttribute("href")).toBe(links[0].url);
	expect(bare.getAttribute("rel")).toBe("noopener noreferrer");
	expect(bare.getAttribute("target")).toBe("_blank");
	expect(fetchArticleLinkPreview).not.toHaveBeenCalled();
	watching[0].show();
	await screen.findByRole("link", { name: "Metadata title (opens in a new tab)" });
	expect(screen.getByText("Example · example.com")).toBeTruthy();
	const image = view.container.querySelector("img") as HTMLImageElement;
	expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
	expect(image.getAttribute("loading")).toBe("lazy");
	fireEvent.error(image);
	expect(view.container.querySelector("img")).toBeNull();
	expect(screen.getByText("A short description")).toBeTruthy();
	expect(watching[0].disconnect).toHaveBeenCalled();
});

test("unavailable previews retain all links; insecure images are never rendered", async () => {
	vi.stubGlobal("IntersectionObserver", undefined);
	vi.mocked(fetchArticleLinkPreview)
		.mockRejectedValueOnce(new Error("Blocked"))
		.mockResolvedValueOnce({ ...preview, title: null, imageUrl: "http://example.com/unsafe.jpg" });
	const more = [...links, { url: "https://other.example/", label: "" }];
	const view = render(<ArticleLinksPanel article={article} links={more} />);
	await waitFor(() => expect(fetchArticleLinkPreview).toHaveBeenCalledTimes(2));
	expect(screen.getAllByRole("listitem")).toHaveLength(2);
	expect(screen.getByRole("link", { name: "Source report (opens in a new tab)" })).toBeTruthy();
	expect(
		screen.getByRole("link", { name: "https://other.example/ (opens in a new tab)" }),
	).toBeTruthy();
	expect(view.container.querySelector("img")).toBeNull();
	expect(screen.queryByRole("progressbar")).toBeNull();
});

test("changing articles aborts visible work and unmount disconnects observers and cancels requests", async () => {
	const watching = observers();
	const signals: AbortSignal[] = [];
	vi.mocked(fetchArticleLinkPreview).mockImplementation((_channel, _article, _url, signal) => {
		signals.push(signal);
		return new Promise(() => {});
	});
	const view = render(<ArticleLinksPanel article={article} links={links} />);
	watching[0].show();
	view.rerender(<ArticleLinksPanel article={{ ...article, id: 3 }} links={links} />);
	expect(signals[0].aborted).toBe(true);
	watching[watching.length - 1].show();
	expect(signals).toHaveLength(2);
	view.unmount();
	expect(signals[1].aborted).toBe(true);
	expect(watching.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
});

test("empty supplied links render an accessible empty state without fetching", () => {
	render(<ArticleLinksPanel article={article} links={[]} />);
	expect(screen.getByText("No related links in this report.")).toBeTruthy();
	expect(fetchArticleLinkPreview).not.toHaveBeenCalled();
});
