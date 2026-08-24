import type { IngestLog } from "@/api/dashboard";
import { useNow } from "@/hooks/use-now";
import { cn, formatTimeAgo } from "@/lib/utils";

function Metric({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "ok" | "muted" | "bad";
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
				tone === "ok" && "bg-success/12 text-success",
				tone === "muted" && "bg-muted text-muted-foreground",
				tone === "bad" && "bg-destructive/12 text-destructive",
			)}
		>
			{label} {value}
		</span>
	);
}

export function IngestTable({ logs }: { logs: IngestLog[] }) {
	const nowMs = useNow();

	if (logs.length === 0) {
		return (
			<div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
				No ingest activity yet.
			</div>
		);
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[640px] border-collapse text-sm">
				<thead>
					<tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
						<th className="px-4 py-2.5 font-medium">Watchlist</th>
						<th className="px-4 py-2.5 font-medium">Result</th>
						<th className="px-4 py-2.5 font-medium">Attempted</th>
						<th className="px-4 py-2.5 font-medium">When</th>
					</tr>
				</thead>
				<tbody>
					{logs.map((log) => (
						<tr key={log.id} className="border-b border-border/70 last:border-0 hover:bg-accent/40">
							<td className="px-4 py-3">
								<p className="font-medium">
									{log.watchlistName?.trim() || `Watchlist #${log.watchlistId}`}
								</p>
								<p className="text-xs text-muted-foreground tabular-nums">#{log.watchlistId}</p>
							</td>
							<td className="px-4 py-3">
								<div className="flex flex-wrap gap-1.5">
									<Metric label="+" value={log.accepted} tone="ok" />
									<Metric label="dup" value={log.deduped} tone="muted" />
									<Metric label="rej" value={log.rejected} tone="bad" />
								</div>
							</td>
							<td className="px-4 py-3 tabular-nums text-muted-foreground">{log.attempted}</td>
							<td className="px-4 py-3 text-muted-foreground">
								{formatTimeAgo(new Date(log.createdAtMs).toISOString(), "long", nowMs)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
