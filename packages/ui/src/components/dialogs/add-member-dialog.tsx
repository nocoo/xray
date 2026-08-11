import type { SourceType } from "@xray/shared";
import { UserPlus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { addGroupMember } from "@/api/groups";
import { addMember, fetchTags, type Tag } from "@/api/watchlists";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

	useEffect(() => {
		if (!open) return;
		setHandle("");
		setNote("");
		setSourceType("x.com");
		setError(null);
		setSaving(false);
		setSelectedTagIds([]);
		if (target?.kind === "watchlist") {
			void fetchTags()
				.then(setTags)
				.catch(() => setTags([]));
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
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
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
						<div className="grid gap-2">
							<Label>Source</Label>
							<div className="flex gap-2">
								{(
									[
										{ value: "x.com" as const, label: "x.com" },
										{ value: "custom" as const, label: "Custom" },
									] as const
								).map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => setSourceType(opt.value)}
										className={cn(
											"flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
											sourceType === opt.value
												? "border-primary bg-primary/10 text-foreground"
												: "border-border bg-secondary text-muted-foreground hover:text-foreground",
										)}
									>
										{opt.label}
									</button>
								))}
							</div>
						</div>
						<div className="grid gap-2">
							<Label htmlFor={handleId}>{sourceType === "x.com" ? "Username" : "Handle"}</Label>
							<div className="relative">
								{sourceType === "x.com" && (
									<span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
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
						{target?.kind === "watchlist" && tags.length > 0 && (
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
						{target?.kind === "watchlist" && (
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
						)}
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
