import { Button, Input } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { Checkbox } from "@nocoo/basalt/components/checkbox";
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
		<div className="min-w-0 space-y-2 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<TagLabels tags={tags} />
				<Button
					type="button"
					size="sm"
					variant="ghost"
					aria-label={`Edit ${label} tags`}
					aria-expanded={open}
					aria-controls={id}
					onClick={() => setOpen(!open)}
				>
					{open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Tags
				</Button>
			</div>
			{open && (
				<div id={id} className="space-y-2 rounded-md border border-basalt-border p-3">
					<p className="text-xs text-basalt-muted-foreground">
						{tags.length}/20 tags · {label}
					</p>
					{state.loading && <p role="status">Loading tags…</p>}
					{state.error && (
						<Banner role="alert" variant="error" size="sm" description={state.error} />
					)}
					<div className="flex flex-wrap gap-2">
						{state.tags.map((tag) => {
							const checked = ids.includes(tag.id);
							return (
								<label
									htmlFor={`${id}-${tag.id}`}
									key={tag.id}
									className="flex min-w-0 max-w-full items-center gap-1.5"
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
						})}
					</div>
					<form
						className="flex flex-wrap items-center gap-2"
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
						<Input
							className="min-w-0 flex-1 basis-32"
							aria-label={`New tag for ${label}`}
							placeholder="New tag name"
							maxLength={64}
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
						<Button
							type="submit"
							className="max-w-full whitespace-normal"
							size="sm"
							variant="outline"
							disabled={state.busy || state.loading || !name.trim() || tags.length >= 20}
						>
							<Plus className="h-4 w-4" /> Create & assign
						</Button>
						{name.trim() && (
							<TagBadge name={name.trim()} size="sm" className="[overflow-wrap:anywhere]" />
						)}
					</form>
				</div>
			)}
		</div>
	);
}
