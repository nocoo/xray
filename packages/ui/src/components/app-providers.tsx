import { Toaster, TooltipProvider } from "@nocoo/basalt";
import { AccentProvider } from "@nocoo/basalt/providers/accent";
import { LinkProvider } from "@nocoo/basalt/providers/link";
import { ThemeProvider } from "@nocoo/basalt/providers/theme";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

/** Indigo-blue — Xray monitoring accent, locked as the default primary. */
const XRAY_ACCENT = {
	primary: { light: "230 75% 55%", dark: "230 60% 50%" },
};

function AppLink({
	href,
	className,
	children,
	...props
}: {
	href: string;
	className?: string;
	children?: ReactNode;
} & Omit<ComponentProps<"a">, "href">) {
	if (/^(https?:|mailto:|tel:)/.test(href)) {
		return (
			<a href={href} className={className} {...props}>
				{children}
			</a>
		);
	}
	return (
		<Link to={href} className={className} {...props}>
			{children}
		</Link>
	);
}

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider>
			<AccentProvider defaultAccent="primary" persist={false} paletteOverrides={XRAY_ACCENT}>
				<LinkProvider render={AppLink}>
					<TooltipProvider delayDuration={0}>
						<Toaster />
						{children}
					</TooltipProvider>
				</LinkProvider>
			</AccentProvider>
		</ThemeProvider>
	);
}
