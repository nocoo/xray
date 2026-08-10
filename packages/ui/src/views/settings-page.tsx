import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchSettings, patchSettings } from "@/api/settings";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";

export function SettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const [email, setEmail] = useState<string>("");
	const [windowHours, setWindowHours] = useState(24);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setBreadcrumbs([{ label: "Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const s = await fetchSettings();
			setEmail(s.email);
			setWindowHours(s.ingest.windowHours);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const onSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSaved(false);
		try {
			const s = await patchSettings(windowHours);
			setWindowHours(s.ingest.windowHours);
			setSaved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

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
			<form className="max-w-sm space-y-3" onSubmit={(ev) => void onSave(ev)}>
				<label className="block text-sm">
					<span className="text-muted-foreground">Ingest window hours (1–168)</span>
					<input
						type="number"
						min={1}
						max={168}
						className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
						value={windowHours}
						onChange={(e) => setWindowHours(Number(e.target.value))}
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
