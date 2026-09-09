import { Button, ConfirmDialog, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { ClipboardText } from "@nocoo/basalt/components/clipboard-text";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { SensitiveInput } from "@nocoo/basalt/components/sensitive-input";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as aiApi from "@/api/ai";
import * as settingsApi from "@/api/settings";
import * as tokensApi from "@/api/tokens";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { createAiSettingsVm } from "@/viewmodels/ai-settings-vm";
import { createSettingsVm } from "@/viewmodels/settings-vm";
import { createTokensVm } from "@/viewmodels/tokens-vm";
import { useVm } from "@/viewmodels/use-vm";

export function SettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const { openCreateToken } = useCreateDialogs();
	const accountVm = useMemo(() => createSettingsVm(settingsApi), []);
	const tokensVm = useMemo(() => createTokensVm(tokensApi), []);
	const aiVm = useMemo(() => createAiSettingsVm(aiApi), []);
	const account = useVm(accountVm);
	const tokens = useVm(tokensVm);
	const ai = useVm(aiVm);
	const [revokeId, setRevokeId] = useState<number | null>(null);
	const [revokeBusy, setRevokeBusy] = useState(false);

	useEffect(() => {
		setBreadcrumbs([{ label: "Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void accountVm.load();
		void tokensVm.load();
		void aiVm.load();
	}, [accountVm, tokensVm, aiVm]);

	const onCreateToken = () => {
		openCreateToken({
			onCreated: (plaintext) => {
				if (plaintext) tokensVm.setOnceSecret(plaintext);
				void tokensVm.load();
			},
		});
	};

	const onRevoke = async () => {
		if (revokeId == null) return;
		setRevokeBusy(true);
		try {
			await tokensVm.revoke(revokeId);
			setRevokeId(null);
		} finally {
			setRevokeBusy(false);
		}
	};

	return (
		<div className="space-y-8">
			<PageHeader title="Settings" description="Account, push tokens, and AI." />

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

			<SectionRule
				id="tokens"
				title="Push tokens"
				hint="Bearer tokens for POST /api/v1/ingest/push on the ingest host."
				actions={
					<Button size="sm" type="button" onClick={onCreateToken}>
						<Plus className="h-4 w-4" />
						New token
					</Button>
				}
			>
				{tokens.onceSecret && (
					<Banner
						variant="alert"
						title="Copy now — full secret is shown once"
						description={
							<div className="space-y-3">
								<ClipboardText text={tokens.onceSecret} className="w-full max-w-full" />
								<pre className="overflow-x-auto rounded bg-basalt-background p-2 text-[11px] text-basalt-muted-foreground">
									{`curl -X POST https://xray-ingest.hexly.ai/api/v1/ingest/push \\
  -H "Authorization: Bearer ${tokens.onceSecret.slice(0, 20)}…" \\
  -H "Content-Type: application/json" \\
  -d '{"watchlist_id":1,"items":[...]}'`}
								</pre>
								<Button
									size="sm"
									variant="ghost"
									type="button"
									onClick={() => tokensVm.setOnceSecret(null)}
								>
									Dismiss
								</Button>
							</div>
						}
					/>
				)}
				{tokens.loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
				{tokens.error && <Banner variant="error" size="sm" description={tokens.error} />}
				<LayerCard>
					{!tokens.loading && tokens.tokens.length === 0 ? (
						<LayerCard.Empty title="No active tokens." />
					) : (
						<ul className="divide-y divide-basalt-border">
							{tokens.tokens.map((t) => (
								<li key={t.id} className="flex items-center gap-3 px-4 py-3">
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium">{t.label}</p>
										<p className="text-xs text-basalt-muted-foreground">
											prefix <code>{t.tokenPrefix}</code>
											{t.lastUsedAtMs
												? ` · last used ${new Date(t.lastUsedAtMs).toLocaleString()}`
												: " · never used"}
										</p>
									</div>
									<Button
										size="icon"
										variant="ghost"
										type="button"
										className="h-8 w-8 text-basalt-destructive"
										onClick={() => setRevokeId(t.id)}
										aria-label="Revoke token"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</li>
							))}
						</ul>
					)}
				</LayerCard>
			</SectionRule>

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
									variant="secondary"
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

			<ConfirmDialog
				open={revokeId != null}
				onOpenChange={(open) => {
					if (!open && !revokeBusy) setRevokeId(null);
				}}
				title="Revoke token"
				description="Revoke this token? Producers using it will stop being able to push."
				confirmLabel="Revoke"
				variant="destructive"
				loading={revokeBusy}
				onConfirm={() => void onRevoke()}
			/>
		</div>
	);
}
