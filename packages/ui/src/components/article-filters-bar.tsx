import { Button, Field, Input } from "@nocoo/basalt";
import { Checkbox } from "@nocoo/basalt/components/checkbox";
import { DatePicker } from "@nocoo/basalt/components/date-picker";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from "@nocoo/basalt/components/popover";
import { type ArticleFilters, parseArticlePageQuery } from "@xray/shared";
import { ArrowRight, RotateCcw, Search, SlidersHorizontal, Tags } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import * as tagsApi from "@/api/tags";
import { OptionsSkeleton } from "@/components/loading-skeletons";
import { articleFilterQuery } from "@/lib/channel-reader";
import { createTagsVm } from "@/viewmodels/tags-vm";
import { useVm } from "@/viewmodels/use-vm";

export function ArticleFiltersBar({
	filterQuery,
	disabled,
	onApply,
}: {
	filterQuery: string;
	disabled: boolean;
	onApply: (query: string) => void;
}) {
	const initial = useMemo<ArticleFilters>(() => {
		const parsed = parseArticlePageQuery(Object.fromEntries(new URLSearchParams(filterQuery)));
		return parsed.ok ? parsed.value : { dateFrom: "", dateTo: "", query: "", tagIds: [] };
	}, [filterQuery]);
	const [draft, setDraft] = useState(initial);
	const [open, setOpen] = useState(false);
	const [tagSearch, setTagSearch] = useState("");
	const tagsVm = useMemo(() => createTagsVm(tagsApi), []);
	const tags = useVm(tagsVm);
	const id = useId();
	useEffect(() => {
		void tagsVm.load();
	}, [tagsVm]);
	useEffect(() => {
		setDraft(initial);
		setOpen(false);
	}, [initial]);
	const count =
		Number(Boolean(initial.dateFrom || initial.dateTo)) +
		Number(Boolean(initial.query)) +
		Number(initial.tagIds.length > 0);
	function apply() {
		setOpen(false);
		onApply(articleFilterQuery(draft));
	}
	return (
		<div className="channel-list-filters shrink-0 space-y-2 border-b border-basalt-border/40 p-3">
			<form
				className="flex min-w-0 items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					apply();
				}}
			>
				<div className="relative min-w-0 flex-1">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-basalt-muted-foreground"
					/>
					<Input
						aria-label="Search reports"
						placeholder="Search reports…"
						value={draft.query}
						maxLength={200}
						className="h-9 pl-8 pr-8"
						disabled={disabled}
						onChange={(event) => setDraft({ ...draft, query: event.target.value })}
					/>
					<Button
						type="submit"
						variant="ghost"
						size="icon"
						className="absolute right-1 top-1 h-7 w-7"
						aria-label="Apply keyword search"
						disabled={disabled}
					>
						<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
					</Button>
				</div>
				<Popover
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) setDraft((previous) => ({ ...initial, query: previous.query }));
					}}
				>
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="relative h-9 w-9 shrink-0"
							aria-label={count ? `Filter reports (${count} active)` : "Filter reports"}
							disabled={disabled}
						>
							<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
							{count > 0 && (
								<span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-basalt-primary px-1 text-xs text-basalt-primary-foreground">
									{count}
								</span>
							)}
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						collisionPadding={16}
						arrow={false}
						aria-labelledby={`${id}-title`}
						aria-describedby={`${id}-description`}
						className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
					>
						<div className="border-b border-basalt-border px-4 py-3">
							<PopoverTitle id={`${id}-title`}>Filter reports</PopoverTitle>
							<PopoverDescription id={`${id}-description`}>
								Combine dates, keywords and any selected tag.
							</PopoverDescription>
						</div>
						<div className="space-y-4 p-4">
							<Field label="Report dates" htmlFor={`${id}-dates`}>
								<DatePicker
									id={`${id}-dates`}
									aria-label="Report date range"
									mode="range"
									className="w-full"
									rangeValue={{ from: draft.dateFrom, to: draft.dateTo }}
									onRangeChange={(range) =>
										setDraft({ ...draft, dateFrom: range.from, dateTo: range.to ?? "" })
									}
									labels={{ placeholder: "Any date" }}
								/>
							</Field>
							<div className="space-y-2">
								<div className="flex items-center justify-between text-sm">
									<span className="inline-flex items-center gap-1.5 font-medium">
										<Tags className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" />
										Tags
									</span>
									<span className="text-xs text-basalt-muted-foreground">
										{draft.tagIds.length}/20 selected
									</span>
								</div>
								<Input
									aria-label="Find filter tags"
									placeholder="Find a tag…"
									value={tagSearch}
									onChange={(event) => setTagSearch(event.target.value)}
								/>
								<fieldset
									className="min-w-0 max-h-48 overflow-y-auto"
									aria-label="Available filter tags"
								>
									{tags.loading && !tags.tags.length ? (
										<OptionsSkeleton label="Loading filter tags" />
									) : tags.error ? (
										<div role="alert" className="text-sm text-basalt-destructive">
											{tags.error}
											<Button variant="ghost" size="sm" onClick={() => void tagsVm.load()}>
												Retry
											</Button>
										</div>
									) : (
										tags.tags
											.filter((tag) =>
												tag.name.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()),
											)
											.map((tag) => (
												<label
													key={tag.id}
													htmlFor={`${id}-tag-${tag.id}`}
													className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 py-2 hover:bg-basalt-accent"
												>
													<Checkbox
														id={`${id}-tag-${tag.id}`}
														size="sm"
														checked={draft.tagIds.includes(tag.id)}
														disabled={!draft.tagIds.includes(tag.id) && draft.tagIds.length >= 20}
														onCheckedChange={(checked) =>
															setDraft({
																...draft,
																tagIds: checked
																	? [...draft.tagIds, tag.id]
																	: draft.tagIds.filter((value) => value !== tag.id),
															})
														}
													/>
													<span className="truncate text-sm" title={tag.name}>
														{tag.name}
													</span>
												</label>
											))
									)}
									{!tags.loading &&
										!tags.error &&
										!tags.tags.some((tag) =>
											tag.name.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()),
										) && (
											<p className="py-2 text-sm text-basalt-muted-foreground">No matching tags.</p>
										)}
								</fieldset>
							</div>
						</div>
						<div className="flex items-center justify-between gap-2 border-t border-basalt-border px-4 py-3">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setDraft({ dateFrom: "", dateTo: "", query: "", tagIds: [] })}
							>
								Reset
							</Button>
							<Button size="sm" onClick={apply}>
								Apply filters
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			</form>
			{filterQuery && (
				<div className="flex min-w-0 items-center justify-between gap-2 text-xs text-basalt-muted-foreground">
					<span>
						{count} active filter{count === 1 ? "" : "s"}
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 gap-1 px-1 text-xs"
						disabled={disabled}
						onClick={() => onApply("")}
					>
						<RotateCcw className="h-3 w-3" aria-hidden="true" />
						Clear filters
					</Button>
				</div>
			)}
		</div>
	);
}
