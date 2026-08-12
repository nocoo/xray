import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Official-style X (Twitter) mark — monochrome filled path for brand chips. */
export function XLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			focusable="false"
			className={cn("shrink-0 fill-current", className)}
			{...props}
		>
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}
