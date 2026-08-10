import { useEffect } from "react";
import { Link } from "react-router";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";

export function SettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	return (
		<div className="space-y-3">
			<h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
			<ul className="space-y-2 text-sm">
				<li>
					<Link className="text-primary underline-offset-4 hover:underline" to="/settings/tokens">
						Push Tokens
					</Link>
				</li>
				<li className="text-muted-foreground">Window hours: 24 (mock)</li>
			</ul>
		</div>
	);
}
