import { Button, Field, Input } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@nocoo/basalt/components/dialog";
import { useId, useState } from "react";
import { useUnsavedDraft } from "@/hooks/use-unsaved-draft";

export function TokenRenameDialog({
	label,
	busy,
	error,
	onSave,
	onClose,
	onRestoreFocus,
}: {
	label: string;
	busy: boolean;
	error: string | null;
	onSave: (name: string) => Promise<unknown>;
	onClose: () => void;
	onRestoreFocus: () => void;
}) {
	const [name, setName] = useState(label);
	const id = useId();
	useUnsavedDraft(name.trim() !== label || busy);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent
				disablePointerDismissal
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					onRestoreFocus();
				}}
				onEscapeKeyDown={(event) => {
					if (busy) event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>Rename token</DialogTitle>
					<DialogDescription>
						Change the producer name without rotating its credential. Existing reports keep their
						original source name.
					</DialogDescription>
				</DialogHeader>
				<form
					className="mt-5 space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (await onSave(name)) onClose();
					}}
				>
					<Field label="Token name" htmlFor={id} required>
						<Input
							id={id}
							value={name}
							onChange={(event) => setName(event.target.value)}
							maxLength={64}
							required
							disabled={busy}
						/>
					</Field>
					{error && <Banner role="alert" variant="error" size="sm" description={error} />}
					<DialogFooter>
						<Button type="button" variant="outline" disabled={busy} onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" loading={busy} disabled={!name.trim() || name.trim() === label}>
							Save name
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
