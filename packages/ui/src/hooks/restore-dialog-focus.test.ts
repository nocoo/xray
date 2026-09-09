import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, StrictMode, useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { useRestoreDialogFocus } from "./restore-dialog-focus";

function Probe({ remount = false }: { remount?: boolean }) {
	const [open, setOpen] = useState(false);
	const [host, setHost] = useState("a");
	const onCloseAutoFocus = useRestoreDialogFocus(open);
	return createElement(
		"div",
		null,
		createElement("button", { type: "button", onClick: () => setOpen(true) }, "Open"),
		open
			? createElement(
					"div",
					{ key: remount ? host : "dock" },
					remount
						? createElement("button", { type: "button", onClick: () => setHost("b") }, "Remount")
						: null,
					createElement(
						"button",
						{
							type: "button",
							onClick: () => {
								setOpen(false);
								if (!remount) onCloseAutoFocus({ preventDefault: () => undefined });
							},
						},
						"Close",
					),
				)
			: null,
	);
}

afterEach(() => cleanup());

describe("useRestoreDialogFocus", () => {
	test("returns focus to the opener", () => {
		render(createElement(Probe));
		const open = screen.getByRole("button", { name: "Open" });
		open.focus();
		fireEvent.click(open);
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(document.activeElement).toBe(open);
	});

	test("restores opener after the overlay remounts", () => {
		render(createElement(Probe, { remount: true }));
		const open = screen.getByRole("button", { name: "Open" });
		open.focus();
		fireEvent.click(open);
		fireEvent.click(screen.getByRole("button", { name: "Remount" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(document.activeElement).toBe(open);
	});

	test("restores opener under StrictMode after remount", () => {
		render(createElement(StrictMode, null, createElement(Probe, { remount: true })));
		const open = screen.getByRole("button", { name: "Open" });
		open.focus();
		fireEvent.click(open);
		fireEvent.click(screen.getByRole("button", { name: "Remount" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(document.activeElement).toBe(open);
	});
});
