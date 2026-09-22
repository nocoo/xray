import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { ConfirmDialog } from "@nocoo/basalt/components/confirm-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@nocoo/basalt/components/dialog";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import type { Tag } from "@xray/shared";
import { Pencil, Plus, Search, Tag as TagIcon, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "@/api/tags";
import { createTagsVm } from "@/viewmodels/tags-vm";
import { useVm } from "@/viewmodels/use-vm";
import { useChannels } from "./channels-context";

export function TagsSettings() {
	const vm = useMemo(() => createTagsVm(api), []);
	const state = useVm(vm);
	const channels = useChannels();
	const [query, setQuery] = useState("");
	const [editor, setEditor] = useState<Tag | "new" | null>(null);
	const [deleting, setDeleting] = useState<Tag | null>(null);
	const [name, setName] = useState("");
	const opener = useRef<HTMLButtonElement | null>(null);
	const search = useRef<HTMLInputElement>(null);
	useEffect(() => {
		void vm.load();
	}, [vm]);
	const filtered = state.tags.filter((tag) =>
		tag.name.toLowerCase().includes(query.trim().toLowerCase()),
	);
	function edit(tag: Tag | "new", trigger: HTMLButtonElement) {
		vm.setState({ error: null });
		opener.current = trigger;
		setName(tag === "new" ? "" : tag.name);
		setEditor(tag);
	}
	function refresh() {
		void channels.loadChannels();
	}
	return (
		<div className="min-w-0 space-y-4">
			<PageHeader
				title={
					<span className="flex items-center gap-2">
						<TagIcon className="h-6 w-6" aria-hidden="true" />
						Tags
					</span>
				}
				description="Organize channels, push tokens, and watchlist members with shared tags."
				actions={
					<Button
						size="sm"
						disabled={state.loading}
						onClick={(event) => edit("new", event.currentTarget)}
					>
						<Plus className="h-4 w-4" aria-hidden="true" />
						New tag
					</Button>
				}
			/>
			{!editor && !deleting && state.error && (
				<Banner
					role="alert"
					variant="error"
					description={state.error}
					action={
						<Button size="sm" variant="outline" onClick={() => void vm.load()}>
							Retry
						</Button>
					}
				/>
			)}
			<LayerCard padding="none">
				<LayerCard.Header className="flex flex-wrap items-center justify-between gap-3">
					<div className="relative min-w-0 w-full sm:max-w-sm">
						<Search
							className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-basalt-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							ref={search}
							type="search"
							className="pl-9"
							aria-label="Search tags"
							placeholder="Search tags…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
					<p role="status" className="shrink-0 text-sm text-basalt-muted-foreground">
						{query.trim() ? `${filtered.length} of ${state.tags.length}` : state.tags.length}{" "}
						{state.tags.length === 1 ? "tag" : "tags"}
					</p>
				</LayerCard.Header>
				{state.loading ? (
					<LayerCard.Loading label="Loading tags" />
				) : filtered.length ? (
					<ul aria-label="Tags" className="divide-y divide-basalt-border">
						{filtered.map((tag) => (
							<li key={tag.id} className="flex min-w-0 items-center gap-3 px-4 py-3">
								<div className="min-w-0 flex-1">
									<TagBadge name={tag.name.trim()} className="[overflow-wrap:anywhere]" />
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										size="sm"
										variant="ghost"
										aria-label={`Rename ${tag.name}`}
										onClick={(event) => edit(tag, event.currentTarget)}
									>
										<Pencil className="h-4 w-4" aria-hidden="true" />
									</Button>
									<ConfirmDialog
										open={deleting?.id === tag.id}
										onOpenChange={(open) => {
											if (open) vm.setState({ error: null });
											setDeleting(open ? tag : null);
										}}
										title="Delete tag?"
										description={
											<>
												<span className="block [overflow-wrap:anywhere]">
													Delete “{tag.name}” and remove its associations with all channels, push
													tokens, and watchlist members? The resources and their content will be
													kept.
												</span>
												{state.error && (
													<span role="alert" className="mt-3 block text-basalt-destructive">
														{state.error}
													</span>
												)}
											</>
										}
										confirmLabel="Delete tag"
										variant="destructive"
										loading={state.busy}
										trigger={
											<Button size="sm" variant="ghost" aria-label={`Delete ${tag.name}`}>
												<Trash2 className="h-4 w-4" aria-hidden="true" />
											</Button>
										}
										onConfirm={async () => {
											if (await vm.remove(tag.id)) {
												setDeleting(null);
												refresh();
												search.current?.focus();
											}
										}}
									/>
								</div>
							</li>
						))}
					</ul>
				) : (
					<LayerCard.Empty
						icon={<TagIcon className="h-6 w-6" aria-hidden="true" />}
						title={query.trim() ? "No matching tags" : "No tags yet"}
						description={
							query.trim()
								? "Try another name or clear your search."
								: "Create your first tag to keep related resources organized."
						}
						action={
							query.trim() ? (
								<Button size="sm" variant="outline" onClick={() => setQuery("")}>
									Clear search
								</Button>
							) : (
								<Button
									size="sm"
									variant="outline"
									onClick={(event) => edit("new", event.currentTarget)}
								>
									Create your first tag
								</Button>
							)
						}
					/>
				)}
			</LayerCard>
			<Dialog
				open={editor !== null}
				onOpenChange={(open) => {
					if (!open && !state.busy) setEditor(null);
				}}
			>
				<DialogContent
					disablePointerDismissal
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						if (opener.current?.isConnected) opener.current.focus();
						else search.current?.focus();
					}}
				>
					<DialogHeader>
						<DialogTitle>{editor === "new" ? "New tag" : "Rename tag"}</DialogTitle>
						<DialogDescription>
							{editor === "new"
								? "Create a shared label for your resources."
								: "The new name will appear wherever this tag is used."}
						</DialogDescription>
					</DialogHeader>
					<form
						className="mt-5 space-y-4"
						onSubmit={async (event) => {
							event.preventDefault();
							if (!editor || state.busy) return;
							const result =
								editor === "new" ? await vm.create(name) : await vm.rename(editor.id, name);
							if (result) {
								setEditor(null);
								refresh();
							}
						}}
					>
						<Field label="Tag name" hint="Use 1–64 characters.">
							<Input
								aria-label={editor === "new" ? "New tag name" : `Rename ${editor?.name ?? "tag"}`}
								value={name}
								onChange={(event) => setName(event.target.value)}
								maxLength={64}
								required
								disabled={state.busy}
								autoComplete="off"
							/>
						</Field>
						<div className="min-w-0 space-y-2">
							<p className="text-xs text-basalt-muted-foreground">Preview</p>
							{name.trim() ? (
								<TagBadge name={name.trim()} className="[overflow-wrap:anywhere]" />
							) : (
								<p className="text-sm text-basalt-muted-foreground">
									Enter a name to preview your tag.
								</p>
							)}
						</div>
						{state.error && (
							<Banner role="alert" variant="error" size="sm" description={state.error} />
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={state.busy}
								onClick={() => setEditor(null)}
							>
								Cancel
							</Button>
							<Button type="submit" loading={state.busy} disabled={!name.trim()}>
								{editor === "new" ? "Create tag" : "Save"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
