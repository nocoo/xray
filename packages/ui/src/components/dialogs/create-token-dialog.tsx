import { KeyRound } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPushToken } from "@/api/tokens";
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

export function CreateTokenDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called with plaintext token once (show-once secret). */
	onCreated?: (plaintext: string, label: string) => void;
}) {
	const labelId = useId();
	const [label, setLabel] = useState("cli");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setLabel("cli");
		setError(null);
		setSaving(false);
	}, [open]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = label.trim() || "cli";
		setSaving(true);
		setError(null);
		try {
			const res = await createPushToken(trimmed);
			onOpenChange(false);
			onCreated?.(res.token ?? "", trimmed);
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
								<KeyRound className="h-5 w-5" strokeWidth={2} />
							</div>
							<div>
								<DialogTitle>New push token</DialogTitle>
								<DialogDescription>
									Bearer token for ingest host. Shown once after create.
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor={labelId}>Label</Label>
							<Input
								id={labelId}
								autoFocus
								placeholder="cli / laptop / ci"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								maxLength={40}
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
						<Button type="submit" disabled={saving}>
							<KeyRound className="h-4 w-4" />
							{saving ? "Creating…" : "Create token"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
