import { Copy, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchPushTokens, type PushToken, revokePushToken } from "@/api/tokens";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { Button } from "@/components/ui/button";

export function TokensPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	const { openCreateToken } = useCreateDialogs();
	const [tokens, setTokens] = useState<PushToken[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [onceSecret, setOnceSecret] = useState<string | null>(null);

	useEffect(() => {
		setBreadcrumbs([{ label: "Settings", href: "/settings" }, { label: "Push tokens" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setTokens(await fetchPushTokens());
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const onCreate = () => {
		openCreateToken({
			onCreated: (plaintext) => {
				if (plaintext) setOnceSecret(plaintext);
				void load();
			},
		});
	};

	const onRevoke = async (id: number) => {
		if (!window.confirm("Revoke this token?")) return;
		try {
			await revokePushToken(id);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Push tokens</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Bearer tokens for{" "}
						<code className="rounded bg-muted px-1">POST /api/v1/ingest/push</code> on the ingest
						host.
					</p>
				</div>
				<Button size="sm" type="button" onClick={onCreate}>
					<Plus className="h-4 w-4" />
					New token
				</Button>
			</div>

			{onceSecret && (
				<div className="rounded-card border border-amber-500/40 bg-amber-500/10 p-4">
					<p className="text-xs font-medium text-amber-800 dark:text-amber-200">
						Copy now — full secret is shown once
					</p>
					<div className="mt-2 flex items-center gap-2">
						<code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs">
							{onceSecret}
						</code>
						<Button
							size="icon-xs"
							variant="outline"
							type="button"
							onClick={() => void navigator.clipboard.writeText(onceSecret)}
						>
							<Copy className="h-3 w-3" />
						</Button>
					</div>
					<pre className="mt-3 overflow-x-auto rounded bg-background p-2 text-[11px] text-muted-foreground">
						{`curl -X POST https://xray-ingest.hexly.ai/api/v1/ingest/push \\
  -H "Authorization: Bearer ${onceSecret.slice(0, 20)}…" \\
  -H "Content-Type: application/json" \\
  -d '{"watchlist_id":1,"items":[...]}'`}
					</pre>
					<Button
						className="mt-2"
						size="xs"
						variant="ghost"
						type="button"
						onClick={() => setOnceSecret(null)}
					>
						Dismiss
					</Button>
				</div>
			)}

			{loading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}

			<ul className="divide-y divide-border rounded-card border border-border">
				{tokens.map((t) => (
					<li key={t.id} className="flex items-center gap-3 px-4 py-3">
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium">{t.label}</p>
							<p className="text-xs text-muted-foreground">
								prefix <code>{t.tokenPrefix}</code>
								{t.lastUsedAtMs
									? ` · last used ${new Date(t.lastUsedAtMs).toLocaleString()}`
									: " · never used"}
							</p>
						</div>
						<Button
							size="icon-xs"
							variant="ghost"
							type="button"
							className="text-destructive"
							onClick={() => void onRevoke(t.id)}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					</li>
				))}
				{!loading && tokens.length === 0 && (
					<li className="px-4 py-8 text-center text-sm text-muted-foreground">No active tokens.</li>
				)}
			</ul>
		</div>
	);
}
