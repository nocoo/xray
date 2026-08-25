import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ExpandableText } from "./expandable-text";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("ExpandableText", () => {
	test("keeps the full string in the DOM when collapsed", () => {
		const text = "完整正文不会被截断。".repeat(40);
		Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
			configurable: true,
			get() {
				return 400;
			},
		});
		render(
			<ExpandableText lines={6} className="text-sm leading-relaxed">
				{text}
			</ExpandableText>,
		);
		expect(screen.getByTestId("expandable-text").textContent).toBe(text);
		const toggle = screen.getByTestId("expandable-text-toggle");
		expect(toggle.textContent).toBe("Show more");
		fireEvent.click(toggle);
		expect(toggle.textContent).toBe("Show less");
		expect(screen.getByTestId("expandable-text").textContent).toBe(text);
	});
});
