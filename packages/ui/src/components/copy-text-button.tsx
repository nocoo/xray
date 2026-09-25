import { Button } from "@nocoo/basalt";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { HeaderTooltip } from "@/components/layout/header-links";
import { copyChannelText } from "@/lib/channel-reader";

export function CopyTextButton({
	text,
	label,
	disabled,
	className,
	iconOnly = false,
}: {
	text: string;
	label: string;
	disabled?: boolean;
	className?: string;
	iconOnly?: boolean;
}) {
	const [status, setStatus] = useState("");
	const [copying, setCopying] = useState(false);
	useEffect(() => {
		if (!status) return;
		const timer = setTimeout(() => setStatus(""), 2500);
		return () => clearTimeout(timer);
	}, [status]);
	const Icon = status === "Copied" ? Check : status ? TriangleAlert : Copy;
	const button = (
		<Button
			variant="outline"
			size={iconOnly ? "icon" : "sm"}
			className={className}
			disabled={disabled || copying}
			title={iconOnly ? undefined : status || label}
			onClick={async () => {
				setStatus("");
				setCopying(true);
				setStatus(await copyChannelText(text, navigator.clipboard));
				setCopying(false);
			}}
		>
			<Icon className="h-4 w-4" aria-hidden="true" />
			<span aria-live="polite" className={iconOnly ? "sr-only" : undefined}>
				{status ? (status === "Copied" ? status : "Copy failed") : label}
			</span>
		</Button>
	);
	return iconOnly ? <HeaderTooltip label={status || label}>{button}</HeaderTooltip> : button;
}
