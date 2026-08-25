import { useLayoutEffect, useRef, useState } from "react";
import {
	parseLineHeightPx,
	resolveClampMaxHeight,
	textBlockOverflows,
} from "@/lib/expandable-text";
import { cn } from "@/lib/utils";

export type ExpandableTextProps = {
	lines: number;
	className?: string;
	children: React.ReactNode;
};

export function ExpandableText({ lines, className, children }: ExpandableTextProps) {
	const ref = useRef<HTMLParagraphElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [overflows, setOverflows] = useState(false);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		const measure = () => {
			const cs = getComputedStyle(el);
			const fontSize = Number.parseFloat(cs.fontSize);
			const lineHeight = parseLineHeightPx(cs.lineHeight, fontSize);
			const maxHeight = resolveClampMaxHeight(lineHeight, lines);
			setOverflows(textBlockOverflows(el.scrollHeight, maxHeight));
		};

		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, [lines]);

	return (
		<div className="min-w-0">
			<p
				ref={ref}
				data-testid="expandable-text"
				className={cn("min-w-0", !expanded && "overflow-hidden", className)}
				style={expanded ? undefined : { maxHeight: `${lines}lh` }}
			>
				{children}
			</p>
			{overflows ? (
				<button
					type="button"
					data-testid="expandable-text-toggle"
					className="mt-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
					aria-expanded={expanded}
					onClick={(e) => {
						e.stopPropagation();
						setExpanded((v) => !v);
					}}
				>
					{expanded ? "Show less" : "Show more"}
				</button>
			) : null}
		</div>
	);
}
