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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import { TAG_COLORS, TagBadge, tagColorFor } from "@nocoo/basalt/components/tag-badge";
import type { Tag } from "@xray/shared";
import {
	ArrowDownAZ,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Tag as TagIcon,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "@/api/tags";
import { LoadingSkeleton } from "@/components/loading-skeletons";
import { createTagsVm } from "@/viewmodels/tags-vm";
import { useVm } from "@/viewmodels/use-vm";
import { useChannels } from "./channels-context";

const palette = ["slate", "blue", "violet", "teal", "amber", "rose"] as const;

export function TagsSettings() {
	const vm = useMemo(() => createTagsVm(api), []);
	const state = useVm(vm);
	const channels = useChannels();
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState("asc");
	const [color, setColor] = useState("all");
	const [editor, setEditor] = useState<Tag | "new" | null>(null);
	const [deleting, setDeleting] = useState<Tag | null>(null);
	const [name, setName] = useState("");
	const opener = useRef<HTMLButtonElement | null>(null);
	const search = useRef<HTMLInputElement>(null);
	useEffect(() => {
		void vm.load();
	}, [vm]);
	const initialLoading = state.loading && !state.tags.length;
	const filtering = !!query.trim() || color !== "all";
	const filtered = state.tags
		.filter(
			(tag) =>
				tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
				(color === "all" || tagColorFor(tag.name.trim()) === color),
		)
		.sort(
			(a, b) =>
				(sort === "asc" ? 1 : -1) *
				a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
		);
	function clearFilters() {
		setQuery("");
		setColor("all");
		search.current?.focus();
	}
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
						<TagIcon className="h-5 w-5 text-basalt-muted-foreground" aria-hidden="true" />
						Tags
					</span>
				}
				description="One collection of labels for your channels, push tokens, and watchlist members."
				actions={
					<>
						<Button
							size="sm"
							variant="outline"
							disabled={state.loading || state.busy}
							onClick={() => void vm.load()}
						>
							<RefreshCw className="h-4 w-4" aria-hidden="true" />
							Refresh
						</Button>
						<Button
							size="sm"
							disabled={state.loading}
							onClick={(event) => edit("new", event.currentTarget)}
						>
							<Plus className="h-4 w-4" aria-hidden="true" />
							New tag
						</Button>
					</>
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
			<LayerCard padding="none" className="bg-basalt-secondary">
				<LayerCard.Header className="flex-col gap-3">
					<div className="grid w-full min-w-0 grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
						<div className="relative min-w-0">
							<Search
								className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-basalt-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								ref={search}
								type="search"
								className="pl-9"
								aria-label="Search tags"
								placeholder="Find a tag by name…"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</div>
						<Select value={sort} onValueChange={setSort}>
							<SelectTrigger aria-label="Sort tags" className="min-w-0 gap-2">
								<ArrowDownAZ className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="asc">Name A–Z</SelectItem>
								<SelectItem value="desc">Name Z–A</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<fieldset
						aria-label="Filter tags by color"
						className="grid w-full min-w-0 grid-cols-3 gap-2 lg:grid-cols-6"
					>
						{palette.map((item) => {
							const count = state.tags.filter(
								(tag) => tagColorFor(tag.name.trim()) === item,
							).length;
							return (
								<Button
									key={item}
									variant="ghost"
									aria-label={`Filter ${item} tags`}
									aria-pressed={color === item}
									disabled={state.loading}
									onClick={() => setColor(color === item ? "all" : item)}
									className={`h-auto min-w-0 flex-col gap-1 rounded-basalt-md px-2 py-2 sm:flex-row sm:gap-2 ${color === item ? "bg-basalt-bright ring-1 ring-basalt-ring" : "hover:bg-basalt-bright"}`}
								>
									<TagBadge name={TAG_COLORS[item].label} color={item} size="sm" />
									<div className="text-sm font-semibold tabular-nums text-basalt-foreground">
										{initialLoading ? (
											<SkeletonLine
												className="h-4 dark:bg-basalt-muted-foreground/15"
												style={{ width: "calc(var(--spacing) * 4)" }}
											/>
										) : (
											count
										)}
										<span className="sr-only"> tags</span>
									</div>
								</Button>
							);
						})}
					</fieldset>
					<div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
						<div role="status" className="text-sm text-basalt-muted-foreground">
							{initialLoading ? (
								<SkeletonLine
									className="h-4 dark:bg-basalt-muted-foreground/15"
									style={{ width: "calc(var(--spacing) * 24)" }}
								/>
							) : (
								<>
									<span className="font-medium text-basalt-foreground">
										{filtering ? `${filtered.length} of ${state.tags.length}` : state.tags.length}
									</span>{" "}
									{state.tags.length === 1 ? "tag" : "tags"}
								</>
							)}
						</div>
						{filtering ? (
							<Button size="sm" variant="ghost" className="h-7 px-2" onClick={clearFilters}>
								<X className="h-3.5 w-3.5" aria-hidden="true" />
								Clear filters
							</Button>
						) : (
							<span className="text-xs text-basalt-muted-foreground">
								Shared across your workspace
							</span>
						)}
					</div>
				</LayerCard.Header>
				{initialLoading ? (
					<LoadingSkeleton
						label="Loading tags"
						className="grid grid-cols-1 gap-3 px-4 pb-4 lg:grid-cols-2"
					>
						{[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
							<LayerCard.Well
								key={id}
								className="flex items-center justify-between gap-3 rounded-basalt-md p-3"
							>
								<SkeletonLine className="h-6 rounded-full" minWidth={25} maxWidth={45} />
								<div className="flex shrink-0 gap-1">
									<SkeletonLine
										className="h-8 rounded-basalt-md"
										style={{ width: "calc(var(--spacing) * 16)" }}
									/>
									<SkeletonLine
										className="h-8 rounded-basalt-md"
										style={{ width: "calc(var(--spacing) * 8)" }}
									/>
								</div>
							</LayerCard.Well>
						))}
					</LoadingSkeleton>
				) : state.error && state.tags.length === 0 ? (
					<LayerCard.Empty
						className="py-8"
						icon={<TagIcon className="h-6 w-6" aria-hidden="true" />}
						title="Tags could not be loaded"
						description="Your collection is still safe. Retry when the connection is available."
					/>
				) : filtered.length ? (
					<ul aria-label="Tags" className="grid grid-cols-1 gap-3 px-4 pb-4 lg:grid-cols-2">
						{filtered.map((tag) => (
							<li key={tag.id} className="min-w-0">
								<LayerCard.Well className="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-basalt-md bg-basalt-bright p-3">
									<div className="min-w-0 flex-1">
										<TagBadge
											name={tag.name.trim()}
											title={tag.name}
											className="inline-block truncate align-middle"
										/>
									</div>
									<div className="flex shrink-0 items-center justify-end gap-1">
										<Button
											size="sm"
											variant="ghost"
											className="h-8 px-2"
											aria-label={`Rename ${tag.name}`}
											onClick={(event) => edit(tag, event.currentTarget)}
										>
											<Pencil className="h-4 w-4" aria-hidden="true" />
											<span className="hidden md:inline">Rename</span>
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
												<Button
													size="sm"
													variant="ghost"
													className="h-8 w-8 p-0 text-basalt-muted-foreground hover:text-basalt-destructive"
													aria-label={`Delete ${tag.name}`}
												>
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
								</LayerCard.Well>
							</li>
						))}
					</ul>
				) : (
					<LayerCard.Empty
						icon={<TagIcon className="h-6 w-6" aria-hidden="true" />}
						title={filtering ? "No matching tags" : "No tags yet"}
						description={
							filtering
								? "Try another name or color, or clear your filters."
								: "Create your first tag to keep related resources organized."
						}
						action={
							filtering ? (
								<Button size="sm" variant="outline" onClick={clearFilters}>
									Reset search and color
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
								<TagBadge
									name={name.trim()}
									title={name.trim()}
									className="inline-block truncate align-middle"
								/>
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
