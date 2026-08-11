import { Pencil } from "lucide-react";
import { useEffect, useId, useState } from "react";
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

export function RenameDialog({
	open,
	onOpenChange,
	title = "Rename",
	description,
	initialName,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	description?: string;
	initialName: string;
	onSubmit: (name: string) => Promise<void>;
}) {
	const nameId = useId();
	const [name, setName] = useState(initialName);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setName(initialName);
		setError(null);
		setSaving(false);
	}, [open, initialName]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			setError("Name is required");
			return;
		}
		if (trimmed === initialName.trim()) {
			onOpenChange(false);
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await onSubmit(trimmed);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

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
								<DialogTitle>{title}</DialogTitle>
								{description ? <DialogDescription>{description}</DialogDescription> : null}
							</div>
						</div>
					</DialogHeader>

					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor={nameId}>Name</Label>
							<Input
								id={nameId}
								autoFocus
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={80}
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
						<Button type="submit" disabled={saving || !name.trim()}>
							<Pencil className="h-4 w-4" />
							{saving ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
