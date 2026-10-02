import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CopyTextButton } from "./copy-text-button";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test("copies complete text and keeps transient success and failure feedback on the clicked button", async () => {
	vi.useFakeTimers();
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { clipboard: { writeText } });
	const text = "# Report\n\nFull **Markdown** body\n\nhttps://example.com";
	render(
		<>
			<CopyTextButton text={text} label="Copy full article" />
			<CopyTextButton text="example" label="Copy example" />
		</>,
	);
	const button = screen.getByRole("button", { name: "Copy full article" });
	await act(async () => fireEvent.click(button));
	expect(writeText).toHaveBeenCalledWith(text);
	expect(button.textContent).toBe("Copied");
	expect(screen.getByRole("button", { name: "Copy example" })).toBeTruthy();
	await act(async () => vi.advanceTimersByTime(2500));
	expect(button.textContent).toBe("Copy full article");
	writeText.mockRejectedValueOnce(new Error("Permission denied"));
	await act(async () => fireEvent.click(button));
	expect(button.textContent).toBe("Copy failed");
	await act(async () => vi.advanceTimersByTime(2500));
	expect(button.textContent).toBe("Copy full article");
});

test("forwards the requested action style without changing other copy buttons", () => {
	render(
		<>
			<CopyTextButton text="article" label="Copy article" variant="ghost" size="default" />
			<CopyTextButton text="key" label="Copy key" />
		</>,
	);
	const action = screen.getByRole("button", { name: "Copy article" });
	const key = screen.getByRole("button", { name: "Copy key" });
	expect(action.classList.contains("border")).toBe(false);
	expect(action.classList.contains("text-sm")).toBe(true);
	expect(key.classList.contains("border")).toBe(true);
	expect(key.classList.contains("text-xs")).toBe(true);
});
