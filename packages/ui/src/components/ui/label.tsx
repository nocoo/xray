import type * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
	return (
		// Association is via htmlFor / nesting at each call site.
		// biome-ignore lint/a11y/noLabelWithoutControl: reusable form label primitive
		<label
			data-slot="label"
			className={cn(
				"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Label };
