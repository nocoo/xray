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
	fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
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
