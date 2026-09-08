import { Button, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { ClipboardText } from "@nocoo/basalt/components/clipboard-text";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import * as tokensApi from "@/api/tokens";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { createTokensVm } from "@/viewmodels/tokens-vm";
import { useVm } from "@/viewmodels/use-vm";

export function TokensPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const { openCreateToken } = useCreateDialogs();
	const vm = useMemo(() => createTokensVm(tokensApi), []);
	const { tokens, loading, error, onceSecret } = useVm(vm);

	useEffect(() => {
		setBreadcrumbs([{ label: "Settings", href: "/settings" }, { label: "Push tokens" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	useEffect(() => {
		void vm.load();
	}, [vm]);

	const onCreate = () => {
		openCreateToken({
			onCreated: (plaintext) => {
				if (plaintext) vm.setOnceSecret(plaintext);
				void vm.load();
			},
		});
	};

	const onRevoke = async (id: number) => {
		if (!window.confirm("Revoke this token?")) return;
		await vm.revoke(id);
	};

	return (
		<div className="space-y-8">
			<PageHeader
				title="Push tokens"
				description="Bearer tokens for POST /api/v1/ingest/push on the ingest host."
				actions={
					<Button size="sm" type="button" onClick={onCreate}>
						<Plus className="h-4 w-4" />
						New token
					</Button>
				}
			/>

			{onceSecret && (
				<Banner
					variant="alert"
					title="Copy now — full secret is shown once"
					description={
						<div className="space-y-3">
							<ClipboardText text={onceSecret} className="w-full max-w-full" />
							<pre className="overflow-x-auto rounded bg-basalt-background p-2 text-[11px] text-basalt-muted-foreground">
								{`curl -X POST https://xray-ingest.hexly.ai/api/v1/ingest/push \\
  -H "Authorization: Bearer ${onceSecret.slice(0, 20)}…" \\
  -H "Content-Type: application/json" \\
  -d '{"watchlist_id":1,"items":[...]}'`}
							</pre>
							<Button
								size="sm"
								variant="ghost"
								type="button"
								onClick={() => vm.setOnceSecret(null)}
							>
								Dismiss
							</Button>
						</div>
					}
				/>
			)}

			{loading && <p className="text-sm text-basalt-muted-foreground">Loading…</p>}
			{error && <Banner variant="error" size="sm" description={error} />}

			<LayerCard>
				{!loading && tokens.length === 0 ? (
					<LayerCard.Empty title="No active tokens." />
				) : (
					<ul className="divide-y divide-basalt-border">
						{tokens.map((t) => (
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
									onClick={() => void onRevoke(t.id)}
									aria-label="Revoke token"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							</li>
						))}
					</ul>
				)}
			</LayerCard>
		</div>
	);
}
