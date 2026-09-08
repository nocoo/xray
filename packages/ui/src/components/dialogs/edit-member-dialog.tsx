import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Field,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import { Pencil } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { fetchTags, type Member, patchMember, type Tag } from "@/api/watchlists";

export function EditMemberDialog({
	open,
	onOpenChange,
	watchlistId,
	member,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	watchlistId: number;
	member: Member | null;
	onSaved?: () => void;
}) {
	const noteId = useId();
	const [note, setNote] = useState("");
	const [tags, setTags] = useState<Tag[]>([]);
	const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [tagsError, setTagsError] = useState<string | null>(null);

	useEffect(() => {
		if (!open || !member) return;
		setNote(member.note ?? "");
		setSelectedTagIds(member.tags.map((t) => t.id));
		setError(null);
		setTagsError(null);
		setSaving(false);
		void fetchTags()
			.then((t) => {
				setTags(t);
				setTagsError(null);
			})
			.catch((e) => {
				setTags([]);
				setTagsError(e instanceof Error ? e.message : String(e));
			});
	}, [open, member]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!member) return;
		setSaving(true);
		setError(null);
		try {
			await patchMember(watchlistId, member.id, {
				note: note.trim() || null,
				tagIds: selectedTagIds,
			});
			onOpenChange(false);
			onSaved?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const handleLabel = member?.sourceType === "x.com" ? `@${member.handle}` : (member?.handle ?? "");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={(e) => void submit(e)} className="grid gap-5">
					<DialogHeader>
						<div className="mb-1 flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-basalt-primary/15 text-basalt-primary">
								<Pencil className="h-5 w-5" strokeWidth={2} />
							</div>
							<div>
								<DialogTitle>Edit member</DialogTitle>
								<DialogDescription>
									Update note and tags for {handleLabel || "member"}.
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div className="grid gap-4">
						{tagsError && (
							<Banner variant="error" size="sm" description={`Failed to load tags: ${tagsError}`} />
						)}
						{tags.length > 0 && (
							<Field label="Tags">
								<ToggleGroup
									type="multiple"
									value={selectedTagIds.map(String)}
									onValueChange={(vals) => setSelectedTagIds(vals.map(Number))}
									className="flex flex-wrap gap-2"
								>
									{tags.map((tag) => (
										<ToggleGroupItem key={tag.id} value={String(tag.id)}>
											{tag.name}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</Field>
						)}
						<Field label="Note">
							<InputArea
								id={noteId}
								placeholder="Optional private note"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								rows={2}
								maxLength={200}
							/>
						</Field>
						{error && <Banner variant="error" size="sm" description={error} />}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={saving}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={saving || !member}>
							{saving ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
