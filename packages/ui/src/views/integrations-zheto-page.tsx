import { useCallback, useEffect, useState } from "react";
import { fetchZhetoSettings, saveZhetoSettings, type ZhetoSettings } from "@/api/zheto";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";

export function IntegrationsZhetoPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const [settings, setSettings] = useState<ZhetoSettings | null>(null);
	const [webhookUrl, setWebhookUrl] = useState("");
	const [folder, setFolder] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setBreadcrumbs([{ label: "Integrations" }, { label: "zhe.to" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const s = await fetchZhetoSettings();
			setSettings(s);
			setFolder(s.folder ?? "");
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
			const s = await saveZhetoSettings({
				webhookUrl: webhookUrl || undefined,
				folder: folder || null,
			});
			setSettings(s);
			setWebhookUrl("");
			setSaved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div className="space-y-3">
			<h1 className="font-display text-2xl font-semibold tracking-tight">zhe.to</h1>
			<p className="text-sm text-muted-foreground">
				Webhook URL is stored encrypted. Path token lives only inside the URL.
			</p>
			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
			{saved && <p className="text-sm text-green-600">Saved.</p>}
			<div className="rounded-[var(--radius-card)] bg-secondary p-4 text-sm">
				Status:{" "}
				{settings?.configured ? `configured (${settings.webhookUrlMasked})` : "not configured"}
			</div>
			<form className="max-w-lg space-y-3" onSubmit={(ev) => void onSave(ev)}>
				<label className="block text-sm">
					<span className="text-muted-foreground">Webhook URL</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={webhookUrl}
						onChange={(e) => setWebhookUrl(e.target.value)}
						placeholder={
							settings?.configured ? "leave blank to keep" : "https://zhe.to/api/webhook/…"
						}
						autoComplete="off"
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Default folder</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={folder}
						onChange={(e) => setFolder(e.target.value)}
						maxLength={50}
					/>
				</label>
				<Button type="submit" size="sm">
					Save
				</Button>
			</form>
		</div>
	);
}
