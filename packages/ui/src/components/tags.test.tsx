import { tagColorFor } from "@nocoo/basalt/components/tag-badge";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Tag } from "@xray/shared";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "@/api/tags";
import { createTagsVm } from "@/viewmodels/tags-vm";
import { TagAssignment } from "./tag-assignment";
import { TagLabels } from "./tag-labels";
import { TagsSettings } from "./tags-settings";

vi.mock("@/api/tags", () => ({
	fetchTags: vi.fn(),
	createTag: vi.fn(),
	renameTag: vi.fn(),
	deleteTag: vi.fn(),
	assignChannelTags: vi.fn(),
	assignKeyTags: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("./channels-context", () => ({ useChannels: () => ({ loadChannels: refresh }) }));
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
const tag = { id: 1, name: "Research" };
test("labels reuse the Basalt name hash and ignore legacy colors", () => {
	render(<TagLabels tags={[{ ...tag, color: "danger" } as Tag]} />);
	expect(screen.getByText("Research").getAttribute("data-tag-color")).toBe(tagColorFor("Research"));
});
test("assignment expands inline, selects existing tags and creates with a name preview", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	vi.mocked(api.assignKeyTags)
		.mockResolvedValueOnce([tag])
		.mockResolvedValueOnce([tag, { id: 2, name: "Daily" }]);
	vi.mocked(api.createTag).mockResolvedValue({ id: 2, name: "Daily" });
	const vm = createTagsVm(api);
	await vm.load();
	function Harness() {
		const [tags, setTags] = useState<Tag[]>([]);
		return (
			<TagAssignment vm={vm} tags={tags} channelId={3} keyId={4} label="Agent" onChange={setTags} />
		);
	}
	render(<Harness />);
	fireEvent.click(screen.getByRole("button", { name: "Edit Agent tags" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Research" }));
	await waitFor(() => expect(screen.getByText("1/20 tags · Agent")).toBeTruthy());
	expect(api.assignKeyTags).toHaveBeenCalledWith(3, 4, [1]);
	fireEvent.change(screen.getByRole("textbox", { name: "New tag for Agent" }), {
		target: { value: " Daily " },
	});
	expect(screen.getByText("Daily").getAttribute("data-tag-color")).toBe(tagColorFor("Daily"));
	fireEvent.click(screen.getByRole("button", { name: "Create & assign" }));
	await waitFor(() => expect(api.assignKeyTags).toHaveBeenLastCalledWith(3, 4, [1, 2]));
	await waitFor(() => expect(screen.getByText("2/20 tags · Agent")).toBeTruthy());
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Edit Agent tags" }));
	expect(screen.queryByRole("checkbox")).toBeNull();
});
test("global CRUD refreshes the catalog and deletion requires inline confirmation", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	vi.mocked(api.createTag).mockResolvedValue({ id: 2, name: "Daily" });
	vi.mocked(api.renameTag).mockResolvedValue({ id: 1, name: "News" });
	vi.mocked(api.deleteTag).mockResolvedValue({ deleted: true });
	render(<TagsSettings />);
	await screen.findByText("Research");
	fireEvent.click(screen.getByRole("button", { name: "New tag" }));
	fireEvent.change(screen.getByRole("textbox", { name: "New tag name" }), {
		target: { value: "Daily" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create tag" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	fireEvent.click(screen.getByRole("button", { name: "Rename Research" }));
	fireEvent.change(screen.getByRole("textbox", { name: "Rename Research" }), {
		target: { value: "News" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
	fireEvent.click(screen.getByRole("button", { name: "Delete News" }));
	expect(api.deleteTag).not.toHaveBeenCalled();
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(screen.queryByRole("button", { name: "Delete tag" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Delete News" }));
	fireEvent.click(screen.getByRole("button", { name: "Delete tag" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
	expect(api.deleteTag).toHaveBeenCalledWith(1);
	expect(screen.queryByText("News")).toBeNull();
});

test("duplicate creation errors are announced in Settings and assignment without nested forms", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	vi.mocked(api.createTag).mockRejectedValue(new Error("Tag already exists"));
	const settings = render(<TagsSettings />);
	await screen.findByText("Research");
	fireEvent.click(screen.getByRole("button", { name: "New tag" }));
	fireEvent.change(screen.getByRole("textbox", { name: "New tag name" }), {
		target: { value: "Research" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create tag" }));
	expect((await screen.findByRole("alert")).textContent).toContain("Tag already exists");
	fireEvent.click(screen.getByRole("button", { name: "Rename Research" }));
	expect(settings.container.querySelector("form form")).toBeNull();
	settings.unmount();
	const vm = createTagsVm(api);
	await vm.load();
	const assignment = render(
		<TagAssignment vm={vm} tags={[]} channelId={3} label="channel" onChange={vi.fn()} />,
	);
	fireEvent.click(screen.getByRole("button", { name: "Edit channel tags" }));
	fireEvent.change(screen.getByRole("textbox", { name: "New tag for channel" }), {
		target: { value: "Research" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create & assign" }));
	expect((await screen.findByRole("alert")).textContent).toContain("Tag already exists");
	expect(assignment.container.querySelector("form form")).toBeNull();
});

test("assignment completion after navigation cannot update the new target", async () => {
	vi.mocked(api.fetchTags).mockResolvedValue([tag]);
	let resolve!: (tags: Tag[]) => void;
	vi.mocked(api.assignKeyTags).mockImplementation(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const vm = createTagsVm(api);
	await vm.load();
	const change = vi.fn();
	const view = render(
		<TagAssignment vm={vm} tags={[]} channelId={3} keyId={4} label="Agent" onChange={change} />,
	);
	fireEvent.click(screen.getByRole("button", { name: "Edit Agent tags" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Research" }));
	view.rerender(
		<TagAssignment vm={vm} tags={[]} channelId={5} keyId={6} label="Other" onChange={change} />,
	);
	resolve([tag]);
	await waitFor(() => expect(vm.getState().busy).toBe(false));
	expect(change).not.toHaveBeenCalled();
	vi.mocked(api.createTag).mockResolvedValue({ id: 2, name: "Daily" });
	fireEvent.change(screen.getByRole("textbox", { name: "New tag for Other" }), {
		target: { value: "Daily" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create & assign" }));
	await waitFor(() => expect(api.assignKeyTags).toHaveBeenCalledTimes(2));
	view.unmount();
	resolve([tag]);
	await waitFor(() => expect(vm.getState().busy).toBe(false));
	expect(change).not.toHaveBeenCalled();
});
