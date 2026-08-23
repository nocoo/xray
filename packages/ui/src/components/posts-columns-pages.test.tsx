import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ITEMS_PAGE_LIMIT } from "@/lib/feed-columns";
import { PostsColumnsPages } from "./posts-columns-pages";

afterEach(() => {
	cleanup();
});

describe("PostsColumnsPages", () => {
	test("appending a full page keeps first-page ids in the first column box", () => {
		const first = Array.from({ length: ITEMS_PAGE_LIMIT }, (_, i) => ({ id: i + 1 }));
		const second = Array.from({ length: ITEMS_PAGE_LIMIT }, (_, i) => ({
			id: i + 1 + ITEMS_PAGE_LIMIT,
		}));
		const renderItem = (item: { id: number }) => (
			<div key={item.id} data-testid={`item-${item.id}`}>
				{item.id}
			</div>
		);

		const { rerender } = render(
			<PostsColumnsPages items={first} columnCount={3} renderItem={renderItem} />,
		);
		expect(screen.getAllByTestId("posts-columns-page")).toHaveLength(1);
		expect(screen.getByTestId("item-1")).toBeTruthy();
		expect(screen.getByTestId(`item-${ITEMS_PAGE_LIMIT}`)).toBeTruthy();

		rerender(
			<PostsColumnsPages items={[...first, ...second]} columnCount={3} renderItem={renderItem} />,
		);
		const pages = screen.getAllByTestId("posts-columns-page");
		expect(pages).toHaveLength(2);
		expect(pages[0]?.querySelector(`[data-testid="item-1"]`)).toBeTruthy();
		expect(pages[0]?.querySelector(`[data-testid="item-${ITEMS_PAGE_LIMIT}"]`)).toBeTruthy();
		expect(pages[0]?.querySelector(`[data-testid="item-${ITEMS_PAGE_LIMIT + 1}"]`)).toBeNull();
		expect(pages[1]?.querySelector(`[data-testid="item-${ITEMS_PAGE_LIMIT + 1}"]`)).toBeTruthy();
		expect(pages[0]?.style.columnCount).toBe("3");
		expect(pages[0]?.style.columnFill).toBe("balance");
	});
});
