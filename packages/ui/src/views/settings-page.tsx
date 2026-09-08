import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import * as settingsApi from "@/api/settings";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { createSettingsVm } from "@/viewmodels/settings-vm";
import { useVm } from "@/viewmodels/use-vm";

export function SettingsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const vm = useMemo(() => createSettingsVm(settingsApi), []);
	const { email, windowHours, error, saved, loading } = useVm(vm);

	useEffect(() => {
		setBreadcrumbs([{ label: "Settings" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	return (
		<div className="space-y-8">
			<PageHeader title="Settings" description="Account and ingest window." />
			{loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
			{error && <Banner variant="error" size="sm" description={error} />}
			{saved && <Banner variant="default" size="sm" description="Saved." />}
			<LayerCard className="max-w-lg">
				<LayerCard.Body className="space-y-4">
					{email && (
						<p className="text-sm text-basalt-muted-foreground">
							Signed in as <span className="text-basalt-foreground">{email}</span>
						</p>
					)}
					<form
						className="space-y-3"
						onSubmit={(ev) => {
							ev.preventDefault();
							void vm.save();
						}}
					>
						<Field label="Ingest window hours (1–168)">
							<Input
								type="number"
								min={1}
								max={168}
								value={windowHours}
								onChange={(e) => vm.setWindowHours(Number(e.target.value))}
							/>
						</Field>
						<Button type="submit" size="sm">
							Save window
						</Button>
					</form>
					<p className="text-sm">
						<Link
							className="text-basalt-primary underline-offset-4 hover:underline"
							to="/settings/tokens"
						>
							Push Tokens
						</Link>
					</p>
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
