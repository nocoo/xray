import { Pencil } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { fetchTags, type Member, patchMember, type Tag } from "@/api/watchlists";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
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
							<p className="text-sm text-destructive">Failed to load tags: {tagsError}</p>
						)}
						{tags.length > 0 && (
							<div className="grid gap-2">
								<span className="text-sm font-medium">Tags</span>
								<div className="flex flex-wrap gap-2">
									{tags.map((tag) => {
										const on = selectedTagIds.includes(tag.id);
										return (
											<button
												key={tag.id}
												type="button"
												onClick={() =>
													setSelectedTagIds((prev) =>
														on ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
													)
												}
												className={cn(
													"rounded-full border px-2.5 py-0.5 text-xs transition-colors",
													on
														? "border-primary bg-primary/15 text-foreground"
														: "border-border text-muted-foreground",
												)}
												style={on ? { borderColor: tag.color } : undefined}
											>
												{tag.name}
											</button>
										);
									})}
								</div>
							</div>
						)}
						<div className="grid gap-2">
							<Label htmlFor={noteId}>Note</Label>
							<Textarea
								id={noteId}
								placeholder="Optional private note"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								rows={2}
								maxLength={200}
							/>
						</div>
						{error && <p className="text-sm text-destructive">{error}</p>}
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
