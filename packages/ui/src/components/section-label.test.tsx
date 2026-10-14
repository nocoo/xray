import { cleanup, render, screen } from "@testing-library/react";
import { Eye } from "lucide-react";
import { afterEach, expect, test } from "vitest";
import { SectionLabel } from "./section-label";

afterEach(cleanup);

test("keeps the heading name textual and its semantic icon decorative", () => {
	render(
		<h1>
			<SectionLabel icon={Eye}>Watchlists</SectionLabel>
		</h1>,
	);
	const heading = screen.getByRole("heading", { name: "Watchlists" });
	const icon = heading.querySelector("svg");
	expect(icon?.getAttribute("stroke-width")).toBe("1.5");
	expect(icon?.closest('[aria-hidden="true"]')).toBeTruthy();
	expect(icon?.parentElement?.classList.contains("bg-basalt-tag-blue")).toBe(true);
});

test.each(["green", "amber", "rose", "neutral"] as const)(
	"renders the %s semantic tone without an extra heading",
	(tone) => {
		render(
			<SectionLabel icon={Eye} tone={tone}>
				Section
			</SectionLabel>,
		);
		expect(screen.getByText("Section")).toBeTruthy();
		expect(screen.queryByRole("heading")).toBeNull();
	},
);
