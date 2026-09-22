import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import { useEffect, useMemo } from "react";
import * as aiApi from "@/api/ai";
import * as settingsApi from "@/api/settings";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { TagsSettings } from "@/components/tags-settings";
import { createAiSettingsVm } from "@/viewmodels/ai-settings-vm";
import { createSettingsVm } from "@/viewmodels/settings-vm";
import { useVm } from "@/viewmodels/use-vm";

export function SettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const accountVm = useMemo(() => createSettingsVm(settingsApi), []);
	const aiVm = useMemo(() => createAiSettingsVm(aiApi), []);
	const account = useVm(accountVm);
	const ai = useVm(aiVm);

	useEffect(() => {
		setBreadcrumbs([{ label: "Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void accountVm.load();
		void aiVm.load();
	}, [accountVm, aiVm]);

	return (
		<div className="space-y-4">
			<PageHeader title="Settings" description="Account preferences, tags, and AI configuration." />

			<SectionRule id="account" title="Account" hint="Signed-in user and ingest lookback window.">
				{account.loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
				{account.error && <Banner variant="error" size="sm" description={account.error} />}
				{account.saved && <Banner variant="default" size="sm" description="Saved." />}
				<LayerCard>
					<LayerCard.Body className="space-y-4">
						{account.email && (
							<p className="text-sm text-basalt-muted-foreground">
								Signed in as <span className="text-basalt-foreground">{account.email}</span>
							</p>
						)}
						<form
							className="space-y-3"
							onSubmit={(ev) => {
								ev.preventDefault();
								void accountVm.save();
							}}
						>
							<Field label="Ingest window hours (1–168)">
								<Input
									type="number"
									min={1}
									max={168}
									value={account.windowHours}
									onChange={(e) => accountVm.setWindowHours(Number(e.target.value))}
								/>
							</Field>
							<Button type="submit" size="sm">
								Save window
							</Button>
						</form>
					</LayerCard.Body>
				</LayerCard>
			</SectionRule>

			<TagsSettings />

			<SectionRule
				id="ai"
				title="AI"
				hint="Provider keys are encrypted at rest (AES-GCM). Plaintext is never echoed back."
			>
				{ai.loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
				<LayerCard>
					<LayerCard.Body>
						<form
							className="space-y-3"
							onSubmit={(ev) => {
								ev.preventDefault();
								void aiVm.save();
							}}
						>
							<Field label="Provider">
								<Input
									value={ai.provider}
									onChange={(e) => aiVm.patchForm({ provider: e.target.value })}
									required
								/>
							</Field>
							<Field label="Model">
								<Input
									value={ai.model}
									onChange={(e) => aiVm.patchForm({ model: e.target.value })}
								/>
							</Field>
							<Field label="Base URL (optional)">
								<Input
									value={ai.baseUrl}
									onChange={(e) => aiVm.patchForm({ baseUrl: e.target.value })}
									placeholder="https://api.openai.com/v1"
								/>
							</Field>
							<Field
								label={`API key${ai.cfg?.hasApiKey ? ` (stored ${ai.cfg.apiKeyMasked})` : ""}`}
							>
								<SensitiveInput
									value={ai.apiKey}
									onChange={(e) => aiVm.patchForm({ apiKey: e.target.value })}
									placeholder={ai.cfg?.hasApiKey ? "leave blank to keep" : "sk-…"}
									autoComplete="off"
									revealLabel="Show API key"
									hideLabel="Hide API key"
								/>
							</Field>
							<Field label="Translation prompt">
								<InputArea
									rows={3}
									value={ai.translationPrompt}
									onChange={(e) => aiVm.patchForm({ translationPrompt: e.target.value })}
								/>
							</Field>
							<Field label="Summary prompt (optional)">
								<InputArea
									rows={2}
									value={ai.summaryPrompt}
									onChange={(e) => aiVm.patchForm({ summaryPrompt: e.target.value })}
									placeholder="If set, translate batch also writes summary_text"
								/>
							</Field>
							<div className="flex flex-wrap items-center gap-2 pt-1">
								<Button type="submit" size="sm" loading={ai.saving}>
									{ai.saving ? "Saving…" : "Save"}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={!ai.cfg?.hasApiKey && !ai.apiKey.trim()}
									loading={ai.testing}
									onClick={() => void aiVm.test()}
								>
									{ai.testing ? "Testing…" : "Test connection"}
								</Button>
							</div>
							{(ai.testMsg || ai.error || ai.saved) && (
								<div className="space-y-1.5" role="status" aria-live="polite">
									{ai.testMsg && (
										<Banner
											variant={
												ai.testOk === true ? "default" : ai.testOk === false ? "error" : "secondary"
											}
											size="sm"
											description={ai.testMsg}
										/>
									)}
									{ai.error && <Banner variant="error" size="sm" description={ai.error} />}
									{ai.saved && !ai.error && (
										<Banner variant="default" size="sm" description="Saved." />
									)}
								</div>
							)}
						</form>
					</LayerCard.Body>
				</LayerCard>
			</SectionRule>
		</div>
	);
}
