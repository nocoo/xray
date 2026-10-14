import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import { Bookmark, Save, ShieldCheck, Webhook } from "lucide-react";
import { useEffect, useMemo } from "react";
import * as zhetoApi from "@/api/zheto";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { FormSkeleton } from "@/components/loading-skeletons";
import { SectionLabel } from "@/components/section-label";
import { useUnsavedDraft } from "@/hooks/use-unsaved-draft";
import { useVm } from "@/viewmodels/use-vm";
import { createZhetoSettingsVm } from "@/viewmodels/zheto-settings-vm";

export function IntegrationsZhetoPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const vm = useMemo(() => createZhetoSettingsVm(zhetoApi), []);
	const { settings, webhookUrl, folder, error, saved, loading } = useVm(vm);
	useUnsavedDraft(vm.isDirty());

	useEffect(() => {
		setBreadcrumbs([{ label: "Integrations" }, { label: "zhe.to" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	return (
		<div className="space-y-4">
			<PageHeader
				title={
					<SectionLabel icon={Bookmark} tone="green">
						zhe.to
					</SectionLabel>
				}
				description="Webhook URL is stored encrypted. Path token lives only inside the URL."
			/>

			{error && <Banner variant="error" size="sm" description={error} />}
			{saved && <Banner variant="default" size="sm" description="Saved." />}
			<LayerCard className="max-w-lg">
				<LayerCard.Header>
					<SectionLabel icon={Webhook} tone="green">
						Bookmark delivery
					</SectionLabel>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-4">
					{loading && !settings ? (
						<FormSkeleton label="Loading integration settings" className="grid gap-3" />
					) : (
						<>
							<p className="text-sm text-basalt-muted-foreground">
								Status:{" "}
								{settings?.configured
									? `configured (${settings.webhookUrlMasked})`
									: "not configured"}
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
									<Save className="size-4" strokeWidth={1.5} aria-hidden="true" />
									Save
								</Button>
							</form>
						</>
					)}
				</LayerCard.Body>
			</LayerCard>
			<p className="flex max-w-lg items-start gap-2 text-sm text-basalt-muted-foreground">
				<ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
				Save articles to your own library. Credentials stay encrypted and are never included in
				copied links.
			</p>
		</div>
	);
}
