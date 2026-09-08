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

	test("Escape closes the panel", () => {
		const onClose = vi.fn();
		render(
			<SlidePanel open onClose={onClose} title="Activity" data-testid="activity-panel">
				<button type="button">Row</button>
			</SlidePanel>,
		);
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
		expect(onClose).toHaveBeenCalled();
	});

	test("close button dismisses the panel", () => {
		const onClose = vi.fn();
		render(
			<SlidePanel open onClose={onClose} title="Settings">
				<span>body</span>
			</SlidePanel>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
