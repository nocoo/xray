"use client";

import { Button } from "@nocoo/basalt/components/button";
import { useTheme } from "@nocoo/basalt/providers/theme";
import { Monitor, Moon, Sun } from "lucide-react";
import { HeaderTooltip } from "./header-links";

export type ThemeToggleProps = { "aria-label"?: string };

export function ThemeToggle({ "aria-label": ariaLabel = "Toggle theme" }: ThemeToggleProps = {}) {
	const { theme, setTheme } = useTheme();
	const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
	const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
	return (
		<HeaderTooltip
			label={nextTheme === "system" ? "Use system theme" : `Switch to ${nextTheme} theme`}
		>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => setTheme(nextTheme)}
				aria-label={ariaLabel}
			>
				<Icon className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
			</Button>
		</HeaderTooltip>
	);
}
