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
} from "@nocoo/basalt";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { createGroup } from "@/api/groups";
import { WatchlistIconPicker } from "@/components/watchlist-icon-picker";
import { cn, getAvatarColor } from "@/lib/utils";
import { resolveIcon } from "@/lib/watchlist-icons";

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
						<Field label="Name">
							<Input
								autoFocus
								placeholder="e.g. Following archive"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={80}
							/>
						</Field>
						<Field label="Description">
							<InputArea
								placeholder="Optional"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={2}
								maxLength={280}
							/>
						</Field>
						<Field label="Icon">
							<WatchlistIconPicker value={icon} onValueChange={setIcon} />
						</Field>
						{error && <p className="text-sm text-basalt-destructive">{error}</p>}
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
