import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ChannelArticle } from "@xray/shared";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { hasUnsavedDrafts } from "@/lib/unsaved-drafts";
import { IntegrationsZhetoPage } from "@/views/integrations-zheto-page";
import { SettingsPage } from "@/views/settings-page";
import { ArticleEditor } from "./article-editor";
import { CreateGroupDialog } from "./dialogs/create-group-dialog";
import { CreateWatchlistDialog } from "./dialogs/create-watchlist-dialog";
import { RenameDialog } from "./dialogs/rename-dialog";
import { BreadcrumbsProvider } from "./layout/breadcrumbs-context";

const article: ChannelArticle = {
	id: 2,
	channelId: 1,
	isRead: false,
	markdown: "Original report",
	title: "Daily report",
	externalId: "daily",
	reportDate: "2026-09-22",
	summary: null,
	author: null,
	sourceLabel: "Agent",
	createdAtMs: 1,
	tags: [],
};
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

test("article fields guard changed and reverted drafts, retain failed saves, release on cancel", () => {
	const onSave = vi.fn();
	function Editor() {
		const [open, setOpen] = useState(true);
		return open ? (
			<ArticleEditor
				article={article}
				busy={false}
				onSave={onSave}
				onCancel={() => setOpen(false)}
			/>
		) : null;
	}
	render(<Editor />);
	expect(hasUnsavedDrafts()).toBe(false);
	for (const [label, original, changed] of [
		["Article title", article.title, "New title"],
		["Report date", article.reportDate, "2026-09-23"],
		["Author", "", "Writer"],
		["Summary", "", "Summary"],
		["Markdown", article.markdown, "New report"],
	]) {
		const input = screen.getByLabelText(label, { exact: false });
		fireEvent.change(input, { target: { value: changed } });
		expect(hasUnsavedDrafts()).toBe(true);
		fireEvent.change(input, { target: { value: original } });
		expect(hasUnsavedDrafts()).toBe(false);
	}
	fireEvent.change(screen.getByLabelText("Article title", { exact: false }), {
		target: { value: "Unsaved report" },
	});
	fireEvent.submit(screen.getByRole("form", { name: "Edit article" }));
	expect(onSave).toHaveBeenCalled();
	expect(hasUnsavedDrafts()).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(hasUnsavedDrafts()).toBe(false);
});

test.each([CreateWatchlistDialog, CreateGroupDialog])(
	"resource create dialog registers only modified drafts and clears on close",
	(Component) => {
		const { rerender } = render(
			<MemoryRouter>
				<Component open onOpenChange={vi.fn()} />
			</MemoryRouter>,
		);
		expect(hasUnsavedDrafts()).toBe(false);
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New resource" } });
		expect(hasUnsavedDrafts()).toBe(true);
		rerender(
			<MemoryRouter>
				<Component open={false} onOpenChange={vi.fn()} />
			</MemoryRouter>,
		);
		expect(hasUnsavedDrafts()).toBe(false);
	},
);

test("rename draft remains dirty after failed save and becomes clean when reverted", async () => {
	render(
		<RenameDialog
			open
			onOpenChange={vi.fn()}
			initialName="Original"
			onSubmit={vi.fn().mockRejectedValue(new Error("Failed"))}
		/>,
	);
	expect(hasUnsavedDrafts()).toBe(false);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "New name" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await screen.findByText("Failed");
	expect(hasUnsavedDrafts()).toBe(true);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Original" } });
	expect(hasUnsavedDrafts()).toBe(false);
});

test("account and AI page guards edits and clears only the successfully saved form", async () => {
	const fetcher = vi.fn(async (path: string) =>
		Response.json(
			path === "/api/settings"
				? { email: "owner@xray.test", name: null, image: null, ingest: { windowHours: 24 } }
				: { configured: false },
		),
	);
	vi.stubGlobal("fetch", fetcher);
	render(
		<BreadcrumbsProvider>
			<SettingsPage />
		</BreadcrumbsProvider>,
	);
	const windowInput = await screen.findByRole("spinbutton");
	await screen.findByLabelText("Provider");
	expect(hasUnsavedDrafts()).toBe(false);
	fireEvent.change(windowInput, { target: { value: "48" } });
	fireEvent.change(screen.getByLabelText("Model"), { target: { value: "new-model" } });
	expect(hasUnsavedDrafts()).toBe(true);
	fetcher.mockResolvedValueOnce(
		Response.json({ email: "owner@xray.test", ingest: { windowHours: 48 } }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Save window" }));
	await screen.findByText("Saved.");
	expect(hasUnsavedDrafts()).toBe(true);
	fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4o-mini" } });
	expect(hasUnsavedDrafts()).toBe(false);
});

test("integration form registers private key draft and releases it after successful save", async () => {
	const fetcher = vi.fn(async () =>
		Response.json({ configured: false, webhookUrlMasked: "", folder: null, updatedAtMs: null }),
	);
	vi.stubGlobal("fetch", fetcher);
	render(
		<BreadcrumbsProvider>
			<IntegrationsZhetoPage />
		</BreadcrumbsProvider>,
	);
	const secret = await screen.findByLabelText("Webhook URL");
	await waitFor(() => expect(screen.queryByLabelText("Loading integration settings")).toBeNull());
	expect(hasUnsavedDrafts()).toBe(false);
	fireEvent.change(secret, { target: { value: "https://zhe.to/draft" } });
	expect(hasUnsavedDrafts()).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await screen.findByText("Saved.");
	expect(hasUnsavedDrafts()).toBe(false);
});
