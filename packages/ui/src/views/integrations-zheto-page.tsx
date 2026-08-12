import { useEffect, useMemo } from "react";
import * as zhetoApi from "@/api/zheto";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { useVm } from "@/viewmodels/use-vm";
import { createZhetoSettingsVm } from "@/viewmodels/zheto-settings-vm";

export function IntegrationsZhetoPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const vm = useMemo(() => createZhetoSettingsVm(zhetoApi), []);
	const { settings, webhookUrl, folder, error, saved, loading } = useVm(vm);

	useEffect(() => {
		setBreadcrumbs([{ label: "Integrations" }, { label: "zhe.to" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

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
			<form
				className="max-w-lg space-y-3"
				onSubmit={(ev) => {
					ev.preventDefault();
					void vm.save();
				}}
			>
				<label className="block text-sm">
					<span className="text-muted-foreground">Webhook URL</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={webhookUrl}
						onChange={(e) => vm.setWebhookUrl(e.target.value)}
						placeholder={
							settings?.configured ? "leave blank to keep" : "https://zhe.to/api/link/create/<uuid>"
						}
						autoComplete="off"
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Default folder (optional)</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={folder}
						onChange={(e) => vm.setFolder(e.target.value)}
						placeholder="leave empty for zhe.to default"
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
