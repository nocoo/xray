import { Empty } from "@nocoo/basalt/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
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
				tone === "ok" && "bg-basalt-info-tint text-basalt-info",
				tone === "muted" && "bg-basalt-muted text-basalt-muted-foreground",
				tone === "bad" && "bg-basalt-danger-tint text-basalt-danger",
			)}
		>
			{label} {value}
		</span>
	);
}

export function IngestTable({ logs }: { logs: IngestLog[] }) {
	const nowMs = useNow();

	if (logs.length === 0) {
		return <Empty title="No ingest activity yet." />;
	}

	return (
		<div className="overflow-x-auto">
			<Table className="min-w-[640px]">
				<TableHeader>
					<TableRow>
						<TableHead>Watchlist</TableHead>
						<TableHead>Result</TableHead>
						<TableHead>Attempted</TableHead>
						<TableHead>When</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{logs.map((log) => (
						<TableRow key={log.id}>
							<TableCell>
								<p className="font-medium">
									{log.watchlistName?.trim() || `Watchlist #${log.watchlistId}`}
								</p>
								<p className="text-xs text-basalt-muted-foreground tabular-nums">
									#{log.watchlistId}
								</p>
							</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-1.5">
									<Metric label="+" value={log.accepted} tone="ok" />
									<Metric label="dup" value={log.deduped} tone="muted" />
									<Metric label="rej" value={log.rejected} tone="bad" />
								</div>
							</TableCell>
							<TableCell className="tabular-nums text-basalt-muted-foreground">
								{log.attempted}
							</TableCell>
							<TableCell className="text-basalt-muted-foreground">
								{formatTimeAgo(new Date(log.createdAtMs).toISOString(), "long", nowMs)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
