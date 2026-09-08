import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import { useEffect, useMemo } from "react";
import * as aiApi from "@/api/ai";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { createAiSettingsVm } from "@/viewmodels/ai-settings-vm";
import { useVm } from "@/viewmodels/use-vm";

export function AiSettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const vm = useMemo(() => createAiSettingsVm(aiApi), []);
	const s = useVm(vm);

	useEffect(() => {
		setBreadcrumbs([{ label: "AI Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	return (
		<div className="space-y-8">
			<PageHeader
				title="AI Settings"
				description="Provider keys are encrypted at rest (AES-GCM). Plaintext is never echoed back."
			/>
			{s.loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
			<LayerCard className="max-w-lg">
				<form
					className="space-y-3"
					onSubmit={(ev) => {
						ev.preventDefault();
						void vm.save();
					}}
				>
					<Field label="Provider">
						<Input
							value={s.provider}
							onChange={(e) => vm.patchForm({ provider: e.target.value })}
							required
						/>
					</Field>
					<Field label="Model">
						<Input value={s.model} onChange={(e) => vm.patchForm({ model: e.target.value })} />
					</Field>
					<Field label="Base URL (optional)">
						<Input
							value={s.baseUrl}
							onChange={(e) => vm.patchForm({ baseUrl: e.target.value })}
							placeholder="https://api.openai.com/v1"
						/>
					</Field>
					<Field label={`API key${s.cfg?.hasApiKey ? ` (stored ${s.cfg.apiKeyMasked})` : ""}`}>
						<SensitiveInput
							value={s.apiKey}
							onChange={(e) => vm.patchForm({ apiKey: e.target.value })}
							placeholder={s.cfg?.hasApiKey ? "leave blank to keep" : "sk-…"}
							autoComplete="off"
							revealLabel="Show API key"
							hideLabel="Hide API key"
						/>
					</Field>
					<Field label="Translation prompt">
						<InputArea
							rows={3}
							value={s.translationPrompt}
							onChange={(e) => vm.patchForm({ translationPrompt: e.target.value })}
						/>
					</Field>
					<Field label="Summary prompt (optional)">
						<InputArea
							rows={2}
							value={s.summaryPrompt}
							onChange={(e) => vm.patchForm({ summaryPrompt: e.target.value })}
							placeholder="If set, translate batch also writes summary_text"
						/>
					</Field>
					<div className="flex flex-wrap items-center gap-2 pt-1">
						<Button type="submit" size="sm" loading={s.saving}>
							{s.saving ? "Saving…" : "Save"}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							disabled={!s.cfg?.hasApiKey && !s.apiKey.trim()}
							loading={s.testing}
							onClick={() => void vm.test()}
						>
							{s.testing ? "Testing…" : "Test connection"}
						</Button>
					</div>
					{(s.testMsg || s.error || s.saved) && (
						<div className="space-y-1.5" role="status" aria-live="polite">
							{s.testMsg && (
								<Banner
									variant={
										s.testOk === true ? "default" : s.testOk === false ? "error" : "secondary"
									}
									size="sm"
									description={s.testMsg}
								/>
							)}
							{s.error && <Banner variant="error" size="sm" description={s.error} />}
							{s.saved && !s.error && <Banner variant="default" size="sm" description="Saved." />}
						</div>
					)}
				</form>
			</LayerCard>
		</div>
	);
}
