import { tagColorFor } from "@nocoo/basalt/components/tag-badge";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "@/api/tags";
import { TagsSettings } from "./tags-settings";

vi.mock("@/api/tags", () => ({
	fetchTags: vi.fn(),
	createTag: vi.fn(),
	renameTag: vi.fn(),
	deleteTag: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("./channels-context", () => ({ useChannels: () => ({ loadChannels: refresh }) }));
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
const tag = { id: 1, name: "Research" };

test("search distinguishes empty catalog and no matches", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	render(<TagsSettings />);
	await screen.findByText("Research");
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
	expect(screen.getByText("No matching tags")).toBeTruthy();
	expect(screen.getByRole("status").textContent).toBe("0 of 1 tag");
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect(screen.getByText("Research")).toBeTruthy();
	cleanup();
	vi.mocked(api.fetchTags).mockResolvedValue([]);
	render(<TagsSettings />);
	expect(await screen.findByText("No tags yet")).toBeTruthy();
});

test("create and rename retain failed drafts, hash trimmed previews, and refresh the catalog", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	vi.mocked(api.createTag)
		.mockRejectedValueOnce(new Error("Tag already exists"))
		.mockResolvedValueOnce({ id: 2, name: "Daily" });
	vi.mocked(api.renameTag)
		.mockRejectedValueOnce(new Error("Rename failed"))
		.mockResolvedValueOnce({ id: 1, name: "News" });
	render(<TagsSettings />);
	await screen.findByText("Research");
	const trigger = screen.getByRole("button", { name: "New tag" });
	fireEvent.click(trigger);
	const dialog = within(screen.getByRole("dialog"));
	fireEvent.change(dialog.getByRole("textbox"), { target: { value: " Daily " } });
	expect(dialog.getByText("Daily").getAttribute("data-tag-color")).toBe(tagColorFor("Daily"));
	fireEvent.submit(dialog.getByRole("textbox").closest("form") as HTMLFormElement);
	expect((await dialog.findByRole("alert")).textContent).toContain("Tag already exists");
	expect((dialog.getByRole("textbox") as HTMLInputElement).value).toBe(" Daily ");
	fireEvent.click(dialog.getByRole("button", { name: "Create tag" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(document.activeElement).toBe(trigger));
	fireEvent.click(screen.getByRole("button", { name: "Rename Research" }));
	const rename = within(screen.getByRole("dialog"));
	fireEvent.change(rename.getByRole("textbox"), { target: { value: "News" } });
	fireEvent.click(rename.getByRole("button", { name: "Save" }));
	expect((await rename.findByRole("alert")).textContent).toContain("Rename failed");
	expect((rename.getByRole("textbox") as HTMLInputElement).value).toBe("News");
	fireEvent.click(rename.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
	expect(api.renameTag).toHaveBeenLastCalledWith(1, "News");
});

test("delete confirmation retains errors and restores focus after cancel and removal", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	vi.mocked(api.deleteTag)
		.mockRejectedValueOnce(new Error("Delete failed"))
		.mockResolvedValueOnce({ deleted: true });
	render(<TagsSettings />);
	await screen.findByText("Research");
	const trigger = screen.getByRole("button", { name: "Delete Research" });
	fireEvent.click(trigger);
	expect(api.deleteTag).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	await waitFor(() => expect(document.activeElement).toBe(trigger));
	fireEvent.click(trigger);
	fireEvent.click(screen.getByRole("button", { name: "Delete tag" }));
	expect((await within(screen.getByRole("alertdialog")).findByRole("alert")).textContent).toBe(
		"Delete failed",
	);
	fireEvent.click(screen.getByRole("button", { name: "Delete tag" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	expect(screen.queryByText("Research")).toBeNull();
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox")));
});

test("Escape closes the editor and returns focus to its opener", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	render(<TagsSettings />);
	await screen.findByText("Research");
	const trigger = screen.getByRole("button", { name: "Rename Research" });
	fireEvent.click(trigger);
	await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox")));
	fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape", code: "Escape" });
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	await waitFor(() => expect(document.activeElement).toBe(trigger));
	expect(api.renameTag).not.toHaveBeenCalled();
});

test("catalog sorts by name and combines palette filtering with search", async () => {
	const tags = [
		{ id: 1, name: "Zebra" },
		{ id: 2, name: "Alpha" },
		{ id: 3, name: "Beta" },
	];
	vi.mocked(api.fetchTags).mockResolvedValue(tags);
	render(<TagsSettings />);
	await screen.findByText("Alpha");
	const names = () =>
		screen
			.getAllByRole("listitem")
			.map((row) => row.querySelector("[data-tag-color]")?.textContent);
	expect(names()).toEqual(["Alpha", "Beta", "Zebra"]);
	fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort tags" }), { key: "ArrowDown" });
	fireEvent.click(await screen.findByRole("option", { name: "Name Z–A" }));
	expect(names()).toEqual(["Zebra", "Beta", "Alpha"]);
	const color = tagColorFor("Alpha");
	fireEvent.click(screen.getByRole("button", { name: `Filter ${color} tags` }));
	expect(
		screen.getByRole("button", { name: `Filter ${color} tags` }).getAttribute("aria-pressed"),
	).toBe("true");
	expect(names()).toEqual(
		[...tags]
			.filter((tag) => tagColorFor(tag.name) === color)
			.sort((a, b) => b.name.localeCompare(a.name))
			.map((tag) => tag.name),
	);
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "does not exist" } });
	expect(screen.getByText("No matching tags")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect(names()).toEqual(["Zebra", "Beta", "Alpha"]);
	expect(document.activeElement).toBe(screen.getByRole("searchbox"));
});

test("load errors show retry instead of an empty collection; refresh preserves filters", async () => {
	vi.mocked(api.fetchTags)
		.mockRejectedValueOnce(new Error("Network unavailable"))
		.mockResolvedValueOnce([tag])
		.mockResolvedValueOnce([tag, { id: 2, name: "Daily" }]);
	render(<TagsSettings />);
	expect(await screen.findByText("Tags could not be loaded")).toBeTruthy();
	expect(screen.queryByText("No tags yet")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await screen.findByText("Research");
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Research" } });
	fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
	await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 of 2 tags"));
	expect(screen.queryByText("Daily")).toBeNull();
});

test("spectrum shows real counts and the active swatch toggles back to all tags", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([
		{ id: 1, name: "Alpha" },
		{ id: 2, name: "Beta" },
	]);
	render(<TagsSettings />);
	await screen.findByText("Alpha");
	const buttons = within(screen.getByRole("group", { name: "Filter tags by color" })).getAllByRole(
		"button",
	);
	expect(buttons).toHaveLength(6);
	const total = buttons.reduce(
		(sum, button) => sum + Number(button.textContent?.match(/\d+/)?.[0]),
		0,
	);
	expect(total).toBe(2);
	const swatch = screen.getByRole("button", { name: `Filter ${tagColorFor("Alpha")} tags` });
	fireEvent.click(swatch);
	fireEvent.click(swatch);
	expect(swatch.getAttribute("aria-pressed")).toBe("false");
	expect(screen.getAllByRole("listitem")).toHaveLength(2);
});
