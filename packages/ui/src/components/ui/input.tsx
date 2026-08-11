import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"flex h-9 w-full min-w-0 rounded-md border border-border bg-secondary px-3 py-1 text-sm transition-colors outline-none",
				"placeholder:text-muted-foreground",
				"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/20",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
