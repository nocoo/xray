import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import { useEffect, useMemo } from "react";
import * as zhetoApi from "@/api/zheto";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
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
		<div className="space-y-8">
			<PageHeader
				title="zhe.to"
				description="Webhook URL is stored encrypted. Path token lives only inside the URL."
			/>
			{loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
			{error && <Banner variant="error" size="sm" description={error} />}
			{saved && <Banner variant="default" size="sm" description="Saved." />}
			<LayerCard className="max-w-lg">
				<LayerCard.Body className="space-y-4">
					<p className="text-sm text-basalt-muted-foreground">
						Status:{" "}
						{settings?.configured ? `configured (${settings.webhookUrlMasked})` : "not configured"}
					</p>
					<form
						className="space-y-3"
						onSubmit={(ev) => {
							ev.preventDefault();
							void vm.save();
						}}
					>
						<Field label="Webhook URL">
							<SensitiveInput
								value={webhookUrl}
								onChange={(e) => vm.setWebhookUrl(e.target.value)}
								placeholder={
									settings?.configured
										? "leave blank to keep"
										: "https://zhe.to/api/link/create/<uuid>"
								}
								autoComplete="off"
								revealLabel="Show webhook URL"
								hideLabel="Hide webhook URL"
							/>
						</Field>
						<Field label="Default folder (optional)">
							<Input
								value={folder}
								onChange={(e) => vm.setFolder(e.target.value)}
								placeholder="leave empty for zhe.to default"
								maxLength={50}
							/>
						</Field>
						<Button type="submit" size="sm">
							Save
						</Button>
					</form>
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
