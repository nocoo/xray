import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SlidePanel } from "./slide-panel";

afterEach(() => {
	cleanup();
	document.body.style.overflow = "";
});

describe("SlidePanel", () => {
	test("closed state unmounts dialog from a11y tree", () => {
		const { rerender } = render(
			<SlidePanel open={false} onClose={() => undefined} title="Settings">
				<button type="button">Inside</button>
			</SlidePanel>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByText("Inside")).toBeNull();

		rerender(
			<SlidePanel open onClose={() => undefined} title="Settings">
				<button type="button">Inside</button>
			</SlidePanel>,
		);
		expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
		expect(screen.getByText("Inside")).toBeTruthy();
	});

	test("Escape closes and body scroll is locked while open", () => {
		const onClose = vi.fn();
		const { unmount } = render(
			<SlidePanel open onClose={onClose} title="Activity" data-testid="activity-panel">
				<button type="button">Row</button>
			</SlidePanel>,
		);
		expect(document.body.style.overflow).toBe("hidden");
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
		unmount();
		expect(document.body.style.overflow).toBe("");
	});

	test("backdrop click closes", () => {
		const onClose = vi.fn();
		render(
			<SlidePanel open onClose={onClose} title="Settings">
				<span>body</span>
			</SlidePanel>,
		);
		fireEvent.click(screen.getByLabelText("Close panel backdrop"));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
