"use client";

import { Button } from "@nocoo/basalt/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt/components/tooltip";
import type { ReactElement } from "react";

export function HeaderTooltip({ label, children }: { label: string; children: ReactElement }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={6}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

export function HexlyLink() {
	return (
		<HeaderTooltip label="Xray on hexly.ai">
			<Button variant="ghost" size="icon" asChild>
				<a
					href="https://hexly.ai/projects/xray"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Xray on hexly.ai (opens in a new tab)"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="m12 2 8.66 5v10L12 22l-8.66-5V7Z" />
						<path d="M12 2v20M3.34 7l17.32 10m0-10L3.34 17" />
					</svg>
					<span className="sr-only">Xray on hexly.ai (opens in a new tab)</span>
				</a>
			</Button>
		</HeaderTooltip>
	);
}
