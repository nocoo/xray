import { Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt/components/tooltip";
import { useNow } from "@/hooks/use-now";
import { formatLocalDateTime, formatTimeAgo } from "@/lib/utils";

export function RelativeTimestamp({ timestamp }: { timestamp: number }) {
	const nowMs = useNow();
	const date = new Date(timestamp);
	const iso = date.toISOString();
	const fullDate = formatLocalDateTime(date);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<time dateTime={iso} className="cursor-help whitespace-nowrap tabular-nums">
					{formatTimeAgo(iso, "long", nowMs)}
					<span className="sr-only"> ({fullDate})</span>
				</time>
			</TooltipTrigger>
			<TooltipContent>{fullDate}</TooltipContent>
		</Tooltip>
	);
}
