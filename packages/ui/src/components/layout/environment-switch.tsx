import { ConfirmDialog, SegmentControl, useConfirm } from "@nocoo/basalt";
import { useState } from "react";
import { getEnvironment, selectEnvironment } from "@/lib/environment";

export function EnvironmentSwitch() {
	const environment = getEnvironment();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { confirm, dialogProps } = useConfirm();
	if (!environment?.local) return null;
	return (
		<>
			<SegmentControl
				legend="Environment"
				className="mr-2 [&>legend]:sr-only [&_[data-slot=segment-control-viewport]]:overflow-visible [&_[data-slot=segment-control-viewport]]:pb-0"
				value={environment.mode ?? ""}
				disabled={busy}
				onValueChange={async (mode) => {
					setBusy(true);
					setError(null);
					try {
						await selectEnvironment(mode, () =>
							confirm({
								title: "Discard unsaved changes?",
								description:
									"Switching environments discards your unsaved changes and returns to the home page.",
								confirmLabel: "Discard and switch",
								variant: "destructive",
							}),
						);
					} catch (cause) {
						setError(cause instanceof Error ? cause.message : String(cause));
					} finally {
						setBusy(false);
					}
				}}
				options={[
					{ value: "demo", label: "Demo", disabled: environment.locked },
					{ value: "e2e", label: "E2E" },
					{ value: "prod", label: "Prod", disabled: environment.locked },
				]}
			/>
			{error && (
				<span role="alert" className="text-xs text-basalt-destructive">
					{error}
				</span>
			)}
			<ConfirmDialog {...dialogProps} />
		</>
	);
}
