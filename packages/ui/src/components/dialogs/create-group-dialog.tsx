import { Users } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import { createGroup } from "@/api/groups";
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
import { cn, getAvatarColor } from "@/lib/utils";
import { resolveIcon, WATCHLIST_ICONS } from "@/lib/watchlist-icons";

const ICON_KEYS = Object.keys(WATCHLIST_ICONS);

export function CreateGroupDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated?: () => void;
}) {
	const navigate = useNavigate();
	const nameId = useId();
	const descId = useId();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [icon, setIcon] = useState("users");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setName("");
		setDescription("");
		setIcon("users");
		setError(null);
		setSaving(false);
	}, [open]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			setError("Name is required");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const g = await createGroup({
				name: trimmed,
				description: description.trim() || null,
				icon,
			});
			onOpenChange(false);
			onCreated?.();
			navigate(`/groups?id=${g.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	const PreviewIcon = resolveIcon(icon);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={(e) => void submit(e)} className="grid gap-5">
					<DialogHeader>
						<div className="mb-1 flex items-center gap-3">
							<div
								className={cn(
									"flex h-10 w-10 items-center justify-center rounded-lg",
									getAvatarColor(name || "group"),
								)}
							>
								<PreviewIcon className="h-5 w-5 text-white" strokeWidth={2} />
							</div>
							<div>
								<DialogTitle>New group</DialogTitle>
								<DialogDescription>
									A reusable pool of members you can copy into watchlists.
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor={nameId}>Name</Label>
							<Input
								id={nameId}
								autoFocus
								placeholder="e.g. Following archive"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={80}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor={descId}>Description</Label>
							<Textarea
								id={descId}
								placeholder="Optional"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={2}
								maxLength={280}
							/>
						</div>
						<div className="grid gap-2">
							<Label>Icon</Label>
							<div className="grid max-h-36 grid-cols-8 gap-1.5 overflow-y-auto rounded-md border border-border bg-secondary p-2">
								{ICON_KEYS.map((key) => {
									const Icon = resolveIcon(key);
									const active = icon === key;
									return (
										<button
											key={key}
											type="button"
											title={key}
											onClick={() => setIcon(key)}
											className={cn(
												"flex h-8 w-8 items-center justify-center rounded-md transition-colors",
												active
													? "bg-primary text-primary-foreground"
													: "text-muted-foreground hover:bg-accent hover:text-foreground",
											)}
										>
											<Icon className="h-4 w-4" strokeWidth={1.75} />
										</button>
									);
								})}
							</div>
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
						<Button type="submit" disabled={saving || !name.trim()}>
							<Users className="h-4 w-4" />
							{saving ? "Creating…" : "Create group"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
