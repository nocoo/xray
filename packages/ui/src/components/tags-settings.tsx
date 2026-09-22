import { Button, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import type { Tag } from "@xray/shared";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as api from "@/api/tags";
import { createTagsVm, type TagsVm } from "@/viewmodels/tags-vm";
import { useVm } from "@/viewmodels/use-vm";
import { useChannels } from "./channels-context";

function TagRow({ tag, vm, onChange }: { tag: Tag; vm: TagsVm; onChange: () => void }) {
	const { busy } = useVm(vm);
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [name, setName] = useState(tag.name);
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-basalt-border py-2">
			{editing ? (
				<form
					className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
					onSubmit={async (event) => {
						event.preventDefault();
						if (await vm.rename(tag.id, name)) {
							setEditing(false);
							onChange();
						}
					}}
				>
					<Input
						className="min-w-0 flex-1 basis-32"
						aria-label={`Rename ${tag.name}`}
						maxLength={64}
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					{name.trim() && (
						<TagBadge name={name.trim()} size="sm" className="[overflow-wrap:anywhere]" />
					)}
					<Button size="sm" type="submit" disabled={busy || !name.trim()}>
						Save
					</Button>
					<Button
						size="sm"
						variant="ghost"
						type="button"
						disabled={busy}
						onClick={() => setEditing(false)}
					>
						Cancel
					</Button>
				</form>
			) : (
				<>
					<TagBadge name={tag.name} size="sm" className="[overflow-wrap:anywhere]" />
					<div className="ml-auto flex items-center gap-1">
						<Button
							size="sm"
							variant="ghost"
							aria-label={`Rename ${tag.name}`}
							disabled={busy || deleting}
							onClick={() => {
								setName(tag.name);
								setEditing(true);
							}}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							size="sm"
							variant="ghost"
							aria-label={`Delete ${tag.name}`}
							disabled={busy}
							onClick={() => setDeleting(!deleting)}
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				</>
			)}
			{deleting && (
				<fieldset
					className="flex w-full flex-wrap items-center gap-2"
					aria-label={`Confirm deleting ${tag.name}`}
				>
					<p className="min-w-0 flex-1 text-sm text-basalt-muted-foreground">
						Delete this tag and remove its associations with all channels, push tokens, and
						watchlist members? The channels, tokens, members, and their content will be kept.
					</p>
					<Button
						size="sm"
						variant="destructive"
						disabled={busy}
						onClick={async () => {
							if (await vm.remove(tag.id)) onChange();
						}}
					>
						Delete tag
					</Button>
					<Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleting(false)}>
						Cancel
					</Button>
				</fieldset>
			)}
		</div>
	);
}

export function TagsSettings() {
	const vm = useMemo(() => createTagsVm(api), []);
	const state = useVm(vm);
	const channels = useChannels();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	useEffect(() => {
		void vm.load();
	}, [vm]);
	const refresh = () => {
		void channels.loadChannels();
	};
	return (
		<SectionRule id="tags" title="Tags" hint="Organize channels and push tokens with shared tags.">
			<LayerCard>
				<div className="flex items-center justify-between gap-2">
					<p className="text-sm text-basalt-muted-foreground">{state.tags.length} tags</p>
					<Button
						size="sm"
						variant="outline"
						aria-expanded={open}
						aria-controls="create-tag"
						onClick={() => setOpen(!open)}
					>
						{open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} New tag
					</Button>
				</div>
				{state.error && <Banner role="alert" variant="error" size="sm" description={state.error} />}
				{state.loading && (
					<p role="status" className="text-sm">
						Loading tags…
					</p>
				)}
				{open && (
					<form
						id="create-tag"
						className="my-3 flex flex-wrap items-center gap-2"
						onSubmit={async (event) => {
							event.preventDefault();
							if (await vm.create(name)) {
								setName("");
								refresh();
							}
						}}
					>
						<Input
							className="min-w-0 flex-1 basis-32"
							aria-label="New tag name"
							placeholder="Tag name"
							maxLength={64}
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
						<Button type="submit" size="sm" disabled={state.busy || state.loading || !name.trim()}>
							Create tag
						</Button>
						{name.trim() && (
							<TagBadge name={name.trim()} size="sm" className="[overflow-wrap:anywhere]" />
						)}
					</form>
				)}
				<div className="mt-2">
					{state.tags.map((tag) => (
						<TagRow key={tag.id} tag={tag} vm={vm} onChange={refresh} />
					))}
				</div>
			</LayerCard>
		</SectionRule>
	);
}
