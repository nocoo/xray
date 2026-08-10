import { useEffect } from "react";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";

export function AiSettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "AI Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	return (
		<div className="space-y-3">
			<h1 className="font-display text-2xl font-semibold tracking-tight">AI Settings</h1>
			<p className="text-sm text-muted-foreground">Mock provider form — secrets never echoed.</p>
			<form className="max-w-lg space-y-3" onSubmit={(e) => e.preventDefault()}>
				<label className="block text-sm">
					<span className="text-muted-foreground">Provider</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
						defaultValue="openai-compatible"
						readOnly
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">Model</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
						defaultValue="gpt-4.1-mini"
						readOnly
					/>
				</label>
				<label className="block text-sm">
					<span className="text-muted-foreground">API key</span>
					<input
						className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
						defaultValue="••••••••"
						readOnly
					/>
				</label>
			</form>
		</div>
	);
}
