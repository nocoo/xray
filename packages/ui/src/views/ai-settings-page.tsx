import { useCallback, useEffect, useState } from "react";
import { type AiConfig, fetchAiConfig, saveAiConfig, testAiConfig } from "@/api/ai";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";

export function AiSettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const [cfg, setCfg] = useState<AiConfig | null>(null);
	const [provider, setProvider] = useState("openai");
	const [model, setModel] = useState("gpt-4o-mini");
	const [baseUrl, setBaseUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [translationPrompt, setTranslationPrompt] = useState("");
	const [summaryPrompt, setSummaryPrompt] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [testMsg, setTestMsg] = useState<string | null>(null);
	const [testing, setTesting] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setBreadcrumbs([{ label: "AI Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await fetchAiConfig();
			if (data && "provider" in data) {
				setCfg(data);
				setProvider(data.provider);
				setModel(data.model ?? "");
				setBaseUrl(data.baseUrl ?? "");
				setTranslationPrompt(data.translationPrompt ?? "");
				setSummaryPrompt(data.summaryPrompt ?? "");
			}
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
			const data = await saveAiConfig({
				provider,
				model: model || null,
				baseUrl: baseUrl || null,
				apiKey: apiKey || undefined,
				translationPrompt: translationPrompt || null,
				summaryPrompt: summaryPrompt || null,
			});
			setCfg(data);
			setApiKey("");
			setSaved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const onTest = async () => {
		setTesting(true);
		setTestMsg(null);
		setError(null);
		try {
			const r = await testAiConfig();
			setTestMsg(
				r.ok
					? `OK (${r.provider ?? provider} / ${r.model ?? model})`
					: `Failed: ${r.error ?? r.status}`,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setTesting(false);
		}
	};

	return (
		<div className="space-y-3">
			<h1 className="font-display text-2xl font-semibold tracking-tight">AI Settings</h1>
			<p className="text-sm text-muted-foreground">
				Provider keys are encrypted at rest (AES-GCM). Plaintext is never echoed back.
			</p>
			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
			{saved && <p className="text-sm text-green-600">Saved.</p>}
			{testMsg && <p className="text-sm text-muted-foreground">{testMsg}</p>}
			<form className="max-w-lg space-y-3" onSubmit={(ev) => void onSave(ev)}>
				<label className="block text-sm">
					<span className="text-muted-foreground">Provider</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={provider}
						onChange={(e) => setProvider(e.target.value)}
						required
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Model</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={model}
						onChange={(e) => setModel(e.target.value)}
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Base URL (optional)</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={baseUrl}
						onChange={(e) => setBaseUrl(e.target.value)}
						placeholder="https://api.openai.com/v1"
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">
						API key {cfg?.hasApiKey ? `(stored ${cfg.apiKeyMasked})` : ""}
					</span>
					<input
						type="password"
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder={cfg?.hasApiKey ? "leave blank to keep" : "sk-…"}
						autoComplete="off"
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Translation prompt</span>
					<textarea
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						rows={3}
						value={translationPrompt}
						onChange={(e) => setTranslationPrompt(e.target.value)}
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Summary prompt (optional)</span>
					<textarea
						className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2"
						rows={2}
						value={summaryPrompt}
						onChange={(e) => setSummaryPrompt(e.target.value)}
						placeholder="If set, translate batch also writes summary_text"
					/>
				</label>
				<div className="flex gap-2">
					<Button type="submit" size="sm">
						Save
					</Button>
					<Button
						type="button"
						size="sm"
						variant="secondary"
						disabled={testing || !cfg?.hasApiKey}
						onClick={() => void onTest()}
					>
						{testing ? "Testing…" : "Test connection"}
					</Button>
				</div>
			</form>
		</div>
	);
}
