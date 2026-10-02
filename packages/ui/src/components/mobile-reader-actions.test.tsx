import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { MobileReaderActions } from "./mobile-reader-actions";

afterEach(cleanup);

function setup(disabled = false, linkCount = 2) {
	const onEdit = vi.fn();
	const onDelete = vi.fn();
	const onToggleLinks = vi.fn();
	const onNavigate = vi.fn();
	const triggerRef = createRef<HTMLButtonElement>();
	function Reader() {
		const [preferences, setPreferences] = useState({ size: 18, sans: false, fullWidth: false });
		return (
			<MemoryRouter>
				<MobileReaderActions
					channelId={42}
					text="# Article\n\nBody"
					disabled={disabled}
					preferences={preferences}
					onPreferences={setPreferences}
					onEdit={onEdit}
					onDelete={onDelete}
					linkCount={linkCount}
					showLinks
					onToggleLinks={onToggleLinks}
					triggerRef={triggerRef}
					onNavigate={onNavigate}
				/>
			</MemoryRouter>
		);
	}
	render(<Reader />);
	return { onEdit, onDelete, onToggleLinks, onNavigate, triggerRef };
}

test("discloses typography without shrinking touch targets or losing size limits", async () => {
	setup();
	expect(screen.queryByRole("button", { name: "Increase font size" })).toBeNull();
	const trigger = screen.getByRole("button", { name: "Reading settings" });
	expect(trigger.className).toContain("h-11 w-11");
	fireEvent.click(trigger);
	await screen.findByRole("dialog", { name: "Reading settings" });
	const smaller = screen.getByRole("button", { name: "Decrease font size" }) as HTMLButtonElement;
	const larger = screen.getByRole("button", { name: "Increase font size" }) as HTMLButtonElement;
	fireEvent.click(smaller);
	expect(smaller.disabled).toBe(true);
	expect(screen.getByRole("status").textContent).toBe("16px");
	for (let index = 0; index < 3; index++) fireEvent.click(larger);
	expect(larger.disabled).toBe(true);
	expect(screen.getByRole("status").textContent).toBe("22px");
	const font = screen.getByRole("button", { name: "Use sans-serif font" });
	fireEvent.click(font);
	expect(font.getAttribute("aria-pressed")).toBe("true");
	fireEvent.keyDown(font, { key: "Escape" });
	await waitFor(() => expect(document.activeElement).toBe(trigger));
});

test.each(["Edit article", "Delete article", "Related links", "Open navigation menu"])(
	"closes disclosure and restores its stable trigger before %s",
	async (label) => {
		const actions = setup();
		const trigger = screen.getByRole("button", { name: "More channel actions" });
		fireEvent.click(trigger);
		await screen.findByRole("dialog", { name: "Channel actions" });
		expect(screen.getByRole("link", { name: "Manage channel" }).getAttribute("href")).toBe(
			"/channels/42/settings",
		);
		fireEvent.click(screen.getByRole("button", { name: label }));
		const action =
			label === "Edit article"
				? actions.onEdit
				: label === "Delete article"
					? actions.onDelete
					: label === "Related links"
						? actions.onToggleLinks
						: actions.onNavigate;
		await waitFor(() => expect(action).toHaveBeenCalledOnce());
		expect(document.activeElement).toBe(trigger);
		expect(screen.queryByRole("dialog", { name: "Channel actions" })).toBeNull();
	},
);

test("unavailable articles disable mutations and empty links without hiding channel navigation", async () => {
	setup(true, 0);
	fireEvent.click(screen.getByRole("button", { name: "More channel actions" }));
	await screen.findByRole("dialog", { name: "Channel actions" });
	for (const name of ["Copy full article", "Edit article", "Delete article", "Related links"])
		expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByRole("link", { name: "Manage channel" })).toBeTruthy();
});

test("outside focus dismissal does not steal focus back from the next control", async () => {
	setup();
	const outside = document.createElement("button");
	outside.textContent = "Outside control";
	document.body.append(outside);
	fireEvent.click(screen.getByRole("button", { name: "More channel actions" }));
	await screen.findByRole("dialog", { name: "Channel actions" });
	outside.focus();
	fireEvent.focusIn(outside);
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Channel actions" })).toBeNull());
	expect(document.activeElement).toBe(outside);
	outside.remove();
});

test("action disclosure uses one borderless row style and no decorative arrow", async () => {
	setup();
	fireEvent.click(screen.getByRole("button", { name: "More channel actions" }));
	const panel = await screen.findByRole("dialog", { name: "Channel actions" });
	expect(panel.querySelector('svg[viewBox="0 0 20 10"]')).toBeNull();
	const names = [
		"Copy full article",
		"Edit article",
		"Related links",
		"Delete article",
		"Open navigation menu",
	];
	const rows = names.map((name) => screen.getByRole("button", { name }));
	rows.push(screen.getByRole("link", { name: "Manage channel" }));
	for (const row of rows) {
		expect(row.classList.contains("border")).toBe(false);
		for (const token of ["min-h-11", "w-full", "justify-start", "gap-3", "px-3", "text-sm"])
			expect(row.classList.contains(token)).toBe(true);
		expect(row.querySelector(":scope > svg + span")).not.toBeNull();
	}
	expect(screen.getByRole("heading", { name: "Channel actions" }).className).toContain("text-sm");
	expect(screen.getByText("Article tools and navigation.").className).toContain("text-xs");
});
