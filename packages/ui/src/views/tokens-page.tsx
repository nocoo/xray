import { useEffect } from "react";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { MOCK_TOKENS } from "@/lib/mock-data";

export function TokensPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "Settings", href: "/settings" }, { label: "Push Tokens" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	return (
		<div className="space-y-4">
			<h1 className="font-display text-2xl font-semibold tracking-tight">Push Tokens</h1>
			<table className="w-full text-left text-sm">
				<thead className="text-xs uppercase text-muted-foreground">
					<tr>
						<th className="py-2">Label</th>
						<th className="py-2">Prefix</th>
						<th className="py-2">Created</th>
					</tr>
				</thead>
				<tbody>
					{MOCK_TOKENS.map((t) => (
						<tr key={t.id} className="border-t border-border">
							<td className="py-2">{t.label}</td>
							<td className="py-2 font-mono text-xs">{t.prefix}</td>
							<td className="py-2 text-muted-foreground">{t.createdAt}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
