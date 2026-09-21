import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ChannelMarkdown } from "./channel-markdown";

afterEach(cleanup);
test("renders GFM safely and retains image/link/table nodes across unrelated rerenders", () => {
	const markdown =
		"## Daily\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![Chart](https://example.test/chart.png)\n\n[Source](https://example.test/)\n\n<script>alert(1)</script>\n\n![Blocked](data:image/png;base64,abc)\n\n[Unsafe](javascript:alert(1))";
	const view = render(<ChannelMarkdown markdown={markdown} />);
	const image = view.getByRole("img", { name: "Chart" });
	const table = view.getByRole("table");
	const link = view.getByRole("link", { name: "Source" });
	expect(link.getAttribute("rel")).toBe("noopener noreferrer");
	expect(
		view.container.querySelector("script, img[src^='data:'], a[href^='javascript:']"),
	).toBeNull();
	view.rerender(<ChannelMarkdown markdown={markdown} />);
	expect(view.getByRole("img", { name: "Chart" })).toBe(image);
	expect(view.getByRole("table")).toBe(table);
	expect(view.getByRole("link", { name: "Source" })).toBe(link);
	fireEvent.error(image);
	expect(view.queryByRole("img", { name: "Chart" })).toBeNull();
	expect(view.getByText("Chart")).toBeTruthy();
});
