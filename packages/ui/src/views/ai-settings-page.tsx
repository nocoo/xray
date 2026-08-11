import { useEffect, useMemo } from "react";
import * as aiApi from "@/api/ai";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
		<div className="space-y-3">
			<h1 className="font-display text-2xl font-semibold tracking-tight">AI Settings</h1>
			<p className="text-sm text-muted-foreground">
				Provider keys are encrypted at rest (AES-GCM). Plaintext is never echoed back.
			</p>
			{s.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			<form
				className="max-w-lg space-y-3"
				onSubmit={(ev) => {
					ev.preventDefault();
					void vm.save();
				}}
			>
				<label className="block text-sm">
					<span className="text-muted-foreground">Provider</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={s.provider}
						onChange={(e) => vm.patchForm({ provider: e.target.value })}
						required
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Model</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={s.model}
						onChange={(e) => vm.patchForm({ model: e.target.value })}
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Base URL (optional)</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={s.baseUrl}
						onChange={(e) => vm.patchForm({ baseUrl: e.target.value })}
						placeholder="https://api.openai.com/v1"
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">
						API key {s.cfg?.hasApiKey ? `(stored ${s.cfg.apiKeyMasked})` : ""}
					</span>
					<input
						type="password"
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={s.apiKey}
						onChange={(e) => vm.patchForm({ apiKey: e.target.value })}
						placeholder={s.cfg?.hasApiKey ? "leave blank to keep" : "sk-…"}
						autoComplete="off"
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Translation prompt</span>
					<textarea
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						rows={3}
						value={s.translationPrompt}
						onChange={(e) => vm.patchForm({ translationPrompt: e.target.value })}
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Summary prompt (optional)</span>
					<textarea
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						rows={2}
						value={s.summaryPrompt}
						onChange={(e) => vm.patchForm({ summaryPrompt: e.target.value })}
						placeholder="If set, translate batch also writes summary_text"
					/>
				</label>
				<div className="flex flex-wrap items-center gap-2 pt-1">
					<Button type="submit" size="sm" disabled={s.saving}>
						{s.saving ? "Saving…" : "Save"}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="secondary"
						disabled={s.testing || (!s.cfg?.hasApiKey && !s.apiKey.trim())}
						onClick={() => void vm.test()}
					>
						{s.testing ? "Testing…" : "Test connection"}
					</Button>
				</div>
				{(s.testMsg || s.error || s.saved) && (
					<div className="space-y-1.5" role="status" aria-live="polite">
						{s.testMsg && (
							<p
								className={cn(
									"rounded-md border px-3 py-2 text-sm font-medium",
									s.testOk === true &&
										"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
									s.testOk === false &&
										"border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
									s.testOk === null && "border-border bg-secondary text-muted-foreground",
								)}
							>
								{s.testMsg}
							</p>
						)}
						{s.error && (
							<p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
								{s.error}
							</p>
						)}
						{s.saved && !s.error && (
							<p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
								Saved.
							</p>
						)}
					</div>
				)}
			</form>
		</div>
	);
}
