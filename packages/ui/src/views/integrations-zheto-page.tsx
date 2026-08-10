import { useEffect } from "react";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";

export function IntegrationsZhetoPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "Integrations" }, { label: "zhe.to" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	return (
		<div className="space-y-3">
			<h1 className="font-display text-2xl font-semibold tracking-tight">zhe.to</h1>
			<p className="text-sm text-muted-foreground">
				Mock settings shell. Full save contract lands in S5 M7.
			</p>
			<div className="rounded-[var(--radius-card)] border border-border bg-secondary p-4 text-sm">
				Webhook URL: <span className="text-muted-foreground">•••••••• (not configured)</span>
			</div>
		</div>
	);
}
