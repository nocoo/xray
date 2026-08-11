import type * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"flex field-sizing-content min-h-20 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm transition-colors outline-none",
				"placeholder:text-muted-foreground",
				"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
