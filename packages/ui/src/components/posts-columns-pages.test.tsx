import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { PostsColumnsPages } from "./posts-columns-pages";

afterEach(() => {
	cleanup();
});

describe("PostsColumnsPages", () => {
	test("keeps earlier cards in the same column after append", () => {
		const first = [1, 2, 3, 4, 5].map((id) => ({ id, h: id === 2 ? 300 : 80 }));
		const extra = { id: 6, h: 80 };
		const renderItem = (item: { id: number }) => (
			<div data-testid={`item-${item.id}`}>{item.id}</div>
		);
		const estimateHeight = (item: { id: number; h: number }) => item.h;

		const { rerender } = render(
			<PostsColumnsPages
				items={first}
				columnCount={3}
				estimateHeight={estimateHeight}
				renderItem={renderItem}
			/>,
		);
		expect(screen.getAllByTestId("posts-masonry-col")).toHaveLength(3);
		const colOf = (id: number) => {
			const el = screen.getByTestId(`item-${id}`);
			return el.closest("[data-testid=posts-masonry-col]");
		};
		const home = colOf(1);
		expect(home).toBeTruthy();

		rerender(
			<PostsColumnsPages
				items={[...first, extra]}
				columnCount={3}
				estimateHeight={estimateHeight}
				renderItem={renderItem}
			/>,
		);
		expect(colOf(1)).toBe(home);
		expect(screen.getByTestId("item-6")).toBeTruthy();
		expect(screen.getByTestId("posts-masonry")).toBeTruthy();
	});
});
