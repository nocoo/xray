import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Field,
	Input,
	Label,
	SegmentControl,
} from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import type { SourceType } from "@xray/shared";
import { UserPlus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { addGroupMember } from "@/api/groups";
import { addMember, fetchTags, type Tag } from "@/api/watchlists";

export type AddMemberTarget =
	| { kind: "watchlist"; id: number; name?: string }
	| { kind: "group"; id: number; name?: string };

export function AddMemberDialog({
	open,
	onOpenChange,
	target,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	target: AddMemberTarget | null;
	onAdded?: () => void;
}) {
	const handleId = useId();
	const noteId = useId();
	const [handle, setHandle] = useState("");
	const [note, setNote] = useState("");
	const [sourceType, setSourceType] = useState<SourceType>("x.com");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [tags, setTags] = useState<Tag[]>([]);
	const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
	const [tagsError, setTagsError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setHandle("");
		setNote("");
		setSourceType("x.com");
		setError(null);
		setSaving(false);
		setSelectedTagIds([]);
		setTagsError(null);
		if (target?.kind === "watchlist") {
			void fetchTags()
				.then((t) => {
					setTags(t);
					setTagsError(null);
				})
				.catch((e) => {
					setTags([]);
					setTagsError(e instanceof Error ? e.message : String(e));
				});
		} else {
			setTags([]);
		}
	}, [open, target?.kind]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!target) return;
		const h = handle.trim().replace(/^@/, "");
		if (!h) {
			setError("Handle is required");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			if (target.kind === "watchlist") {
				await addMember(target.id, {
					sourceType,
					handle: h,
					note: note.trim() || null,
					tagIds: selectedTagIds.length ? selectedTagIds : undefined,
				});
			} else {
				await addGroupMember(target.id, {
					sourceType,
					handle: h,
					displayName: null,
				});
			}
			onOpenChange(false);
			onAdded?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const title =
		target?.kind === "group"
			? `Add to ${target.name ?? "group"}`
			: `Add to ${target?.name ?? "watchlist"}`;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={(e) => void submit(e)} className="grid gap-5">
					<DialogHeader>
						<div className="mb-1 flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-basalt-primary/15 text-basalt-primary">
								<UserPlus className="h-5 w-5" strokeWidth={2} />
							</div>
							<div>
								<DialogTitle>{title}</DialogTitle>
								<DialogDescription>
									Add an x.com account or a custom source handle.
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div className="grid gap-4">
						<SegmentControl
							legend="Source"
							value={sourceType}
							onValueChange={(v) => setSourceType(v as SourceType)}
							options={[
								{ value: "x.com", label: "x.com" },
								{ value: "custom", label: "Custom" },
							]}
						/>
						<div className="grid gap-2">
							<Label htmlFor={handleId}>{sourceType === "x.com" ? "Username" : "Handle"}</Label>
							<div className="relative">
								{sourceType === "x.com" && (
									<span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-basalt-muted-foreground">
										@
									</span>
								)}
								<Input
									id={handleId}
									autoFocus
									placeholder={sourceType === "x.com" ? "karpathy" : "newsletter-id"}
									className={sourceType === "x.com" ? "pl-7" : undefined}
									value={handle}
									onChange={(e) => setHandle(e.target.value)}
									maxLength={80}
								/>
							</div>
						</div>
						{target?.kind === "watchlist" && tagsError && (
							<Banner variant="error" size="sm" description={`Failed to load tags: ${tagsError}`} />
						)}
						{target?.kind === "watchlist" && tags.length > 0 && (
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
						{target?.kind === "watchlist" && (
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
						)}
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
						<Button type="submit" disabled={saving || !handle.trim()}>
							<UserPlus className="h-4 w-4" />
							{saving ? "Adding…" : "Add member"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
