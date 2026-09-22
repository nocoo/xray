import { Button, Field, Input } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { Checkbox } from "@nocoo/basalt/components/checkbox";
import {
	Popover,
	PopoverClose,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from "@nocoo/basalt/components/popover";
import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import type { Tag } from "@xray/shared";
import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { TagsVm } from "@/viewmodels/tags-vm";
import { useVm } from "@/viewmodels/use-vm";
import { TagLabels } from "./tag-labels";

export function TagAssignment({
	vm,
	tags,
	channelId,
	keyId,
	label,
	onChange,
}: {
	vm: TagsVm;
	tags: Tag[];
	channelId: number;
	keyId?: number;
	label: string;
	onChange: (tags: Tag[]) => void;
}) {
	const state = useVm(vm);
	const active = useRef<object | null>(null);
	useEffect(() => {
		active.current = { vm, channelId, keyId };
		return () => {
			active.current = null;
		};
	}, [vm, channelId, keyId]);
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const id = useId();
	const ids = tags.map((tag) => tag.id);
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
			<TagLabels tags={tags} />
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className={tags.length ? "h-7 w-7 shrink-0 p-0" : "h-7 gap-1 px-2 text-xs"}
						aria-label={`Edit ${label} tags`}
						onClick={() => vm.setState({ error: null })}
					>
						<Plus className="h-3.5 w-3.5" aria-hidden="true" />
						{tags.length === 0 && "Add tags"}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					aria-labelledby={`${id}-title`}
					aria-describedby={`${id}-description`}
					collisionPadding={16}
					arrow={false}
					className="w-80 max-w-[calc(100vw-2rem)] p-0"
				>
					<div className="flex items-start justify-between gap-3 border-b border-basalt-border p-4">
						<div className="min-w-0">
							<PopoverTitle id={`${id}-title`}>Tags</PopoverTitle>
							<PopoverDescription id={`${id}-description`} className="break-words">
								{tags.length}/20 tags · {label}
							</PopoverDescription>
						</div>
						<PopoverClose asChild>
							<Button
								size="icon"
								variant="ghost"
								className="h-7 w-7 shrink-0"
								aria-label="Close tag picker"
							>
								<X className="h-4 w-4" aria-hidden="true" />
							</Button>
						</PopoverClose>
					</div>
					{state.error && (
						<div className="px-4 pt-3">
							<Banner role="alert" variant="error" size="sm" description={state.error} />
						</div>
					)}
					<div className="max-h-56 overflow-y-auto p-2">
						{state.loading ? (
							<p role="status" className="p-2 text-sm text-basalt-muted-foreground">
								Loading tags…
							</p>
						) : state.tags.length === 0 ? (
							<p className="p-2 text-sm text-basalt-muted-foreground">
								Create your first tag below.
							</p>
						) : (
							state.tags.map((tag) => {
								const checked = ids.includes(tag.id);
								return (
									<label
										htmlFor={`${id}-${tag.id}`}
										key={tag.id}
										className="flex min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-basalt-accent"
									>
										<Checkbox
											id={`${id}-${tag.id}`}
											size="sm"
											aria-label={tag.name}
											checked={checked}
											disabled={state.busy || (!checked && tags.length >= 20)}
											onCheckedChange={async (value) => {
												const target = active.current;
												const result = await vm.assign(
													channelId,
													keyId,
													value ? [...ids, tag.id] : ids.filter((id) => id !== tag.id),
												);
												if (result && target === active.current) onChange(result);
											}}
										/>
										<TagBadge name={tag.name} size="sm" className="[overflow-wrap:anywhere]" />
									</label>
								);
							})
						)}
					</div>
					<form
						className="space-y-3 border-t border-basalt-border p-4"
						onSubmit={async (event) => {
							event.preventDefault();
							const target = active.current;
							const result = await vm.createAndAssign(channelId, keyId, ids, name);
							if (result && target === active.current) {
								setName("");
								onChange(result);
							}
						}}
					>
						<Field label="Create a tag" htmlFor={`${id}-new`}>
							<div className="flex items-center gap-2">
								<Input
									id={`${id}-new`}
									className="min-w-0 flex-1"
									aria-label={`New tag for ${label}`}
									placeholder="Tag name"
									maxLength={64}
									value={name}
									onChange={(event) => setName(event.target.value)}
								/>
								<Button
									type="submit"
									size="icon"
									variant="outline"
									aria-label="Create & assign"
									disabled={state.busy || state.loading || !name.trim() || tags.length >= 20}
								>
									<Plus className="h-4 w-4" aria-hidden="true" />
								</Button>
							</div>
						</Field>
						{name.trim() && (
							<TagBadge name={name.trim()} size="sm" className="[overflow-wrap:anywhere]" />
						)}
					</form>
				</PopoverContent>
			</Popover>
		</div>
	);
}
