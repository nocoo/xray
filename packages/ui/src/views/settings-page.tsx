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
import { FormSkeleton } from "@/components/loading-skeletons";
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
		<div className="min-w-0 space-y-6">
			<PageHeader title="Settings" description="Account preferences and AI configuration." />

			<SectionRule id="account" title="Account" hint="Signed-in user and ingest lookback window.">
				{account.error && <Banner variant="error" size="sm" description={account.error} />}
				{account.saved && <Banner variant="default" size="sm" description="Saved." />}
				<LayerCard padding="none">
					<LayerCard.Body className="space-y-4">
						{account.loading ? (
							<FormSkeleton label="Loading account settings" fields={1} />
						) : (
							<>
								{account.email && (
									<p className="text-sm text-basalt-muted-foreground [overflow-wrap:anywhere]">
										Signed in as <span className="text-basalt-foreground">{account.email}</span>
									</p>
								)}
								<form
									className="grid min-w-0 gap-4 sm:grid-cols-2"
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
									<div className="flex justify-end border-t border-basalt-border pt-4 sm:col-span-2">
										<Button type="submit" size="sm" disabled={account.loading}>
											Save window
										</Button>
									</div>
								</form>
							</>
						)}
					</LayerCard.Body>
				</LayerCard>
			</SectionRule>

			<SectionRule
				id="ai"
				title="AI"
				hint="Configure your provider, model, and prompts for manual AI actions."
			>
				<LayerCard padding="none">
					<LayerCard.Body>
						{ai.loading ? (
							<FormSkeleton label="Loading AI settings" fields={4} paragraphs={2} />
						) : (
							<form
								className="grid min-w-0 gap-4 sm:grid-cols-2"
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
								<Field label="Translation prompt" className="min-w-0 sm:col-span-2">
									<InputArea
										rows={3}
										value={ai.translationPrompt}
										onChange={(e) => aiVm.patchForm({ translationPrompt: e.target.value })}
									/>
								</Field>
								<Field label="Summary prompt (optional)" className="min-w-0 sm:col-span-2">
									<InputArea
										rows={2}
										value={ai.summaryPrompt}
										onChange={(e) => aiVm.patchForm({ summaryPrompt: e.target.value })}
										placeholder="Instructions for summarizing each translated item"
									/>
								</Field>
								<div className="flex flex-wrap items-center justify-end gap-2 border-t border-basalt-border pt-4 sm:col-span-2">
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
									<div className="space-y-1.5 sm:col-span-2" role="status" aria-live="polite">
										{ai.testMsg && (
											<Banner
												variant={
													ai.testOk === true
														? "default"
														: ai.testOk === false
															? "error"
															: "secondary"
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
						)}
					</LayerCard.Body>
				</LayerCard>
			</SectionRule>
		</div>
	);
}
