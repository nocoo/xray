import { useCallback, useEffect, useState } from "react";
import { type AiConfig, fetchAiConfig, saveAiConfig } from "@/api/ai";
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
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
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
			});
			setCfg(data);
			setApiKey("");
			setSaved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
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
				<Button type="submit" size="sm">
					Save
				</Button>
			</form>
		</div>
	);
}
