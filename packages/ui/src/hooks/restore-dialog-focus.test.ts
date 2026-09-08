import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { useRestoreDialogFocus } from "./restore-dialog-focus";

function Probe() {
	const [open, setOpen] = useState(false);
	const onCloseAutoFocus = useRestoreDialogFocus(open);
	return createElement(
		"div",
		null,
		createElement("button", { type: "button", onClick: () => setOpen(true) }, "Open"),
		open
			? createElement(
					"button",
					{
						type: "button",
						onClick: () => {
							setOpen(false);
							onCloseAutoFocus({ preventDefault: () => undefined });
						},
					},
					"Close",
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
});
