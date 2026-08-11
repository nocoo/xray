import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import * as settingsApi from "@/api/settings";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { createSettingsVm } from "@/viewmodels/settings-vm";
import { useVm } from "@/viewmodels/use-vm";

export function SettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const vm = useMemo(() => createSettingsVm(settingsApi), []);
	const { email, windowHours, error, saved, loading } = useVm(vm);

	useEffect(() => {
		setBreadcrumbs([{ label: "Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	return (
		<div className="space-y-4">
			<h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
			{saved && <p className="text-sm text-green-600">Saved.</p>}
			{email && (
				<p className="text-sm text-muted-foreground">
					Signed in as <span className="text-foreground">{email}</span>
				</p>
			)}
			<form
				className="max-w-sm space-y-3"
				onSubmit={(ev) => {
					ev.preventDefault();
					void vm.save();
				}}
			>
				<label className="block text-sm">
					<span className="text-muted-foreground">Ingest window hours (1–168)</span>
					<input
						type="number"
						min={1}
						max={168}
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={windowHours}
						onChange={(e) => vm.setWindowHours(Number(e.target.value))}
					/>
				</label>
				<Button type="submit" size="sm">
					Save window
				</Button>
			</form>
			<ul className="space-y-2 text-sm">
				<li>
					<Link className="text-primary underline-offset-4 hover:underline" to="/settings/tokens">
						Push Tokens
					</Link>
				</li>
			</ul>
		</div>
	);
}
