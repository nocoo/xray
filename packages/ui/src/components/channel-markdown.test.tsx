import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ChannelMarkdown } from "./channel-markdown";

afterEach(cleanup);
test("renders CJK emphasis beside punctuation without changing literal Markdown", () => {
	const view = render(
		<ChannelMarkdown
			markdown={[
				"**采集时点：**北京时间 2026-09-25 04:44；**观察窗口：**2026-09-24 04:40—2026-09-25 04:44（北京时间）。",
				"这是**本人陈述**，普通 **bold** 与 *italic*。",
				"*来源：*原始记录，***注意：***尚未复核。",
				"中文**「重点」**继续，中文*（补充）*继续。",
				"`**采集时点：**北京时间`",
				"```md\n*来源：*原始记录\n```",
				String.raw`\*\*采集时点：\*\*北京时间`,
			].join("\n\n")}
		/>,
	);
	expect([...view.container.querySelectorAll("strong")].map((node) => node.textContent)).toEqual([
		"采集时点：",
		"观察窗口：",
		"本人陈述",
		"bold",
		"注意：",
		"「重点」",
	]);
	expect([...view.container.querySelectorAll("em")].map((node) => node.textContent)).toEqual([
		"italic",
		"来源：",
		"注意：",
		"（补充）",
	]);
	expect(view.container.querySelector("em strong, strong em")?.textContent).toBe("注意：");
	expect([...view.container.querySelectorAll("code")].map((node) => node.textContent)).toEqual([
		"**采集时点：**北京时间",
		"*来源：*原始记录\n",
	]);
	expect(view.container.querySelector("p:last-child")?.textContent).toBe("**采集时点：**北京时间");
});

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
