import { Button } from "@nocoo/basalt/components/button";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export function InlineAction({
	className,
	destructive,
	...props
}: Omit<ComponentPropsWithRef<typeof Button>, "size" | "variant"> & {
	"aria-label": string;
	destructive?: boolean;
}) {
	return (
		<Button
			{...props}
			variant="ghost"
			size="icon-sm"
			className={cn(
				"text-basalt-muted-foreground max-sm:min-h-basalt-touch max-sm:min-w-basalt-touch [&_svg]:stroke-[1.5]",
				destructive && "hover:text-basalt-destructive focus-visible:text-basalt-destructive",
				className,
			)}
		/>
	);
}
