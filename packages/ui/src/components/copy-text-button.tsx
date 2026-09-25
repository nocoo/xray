import { Button } from "@nocoo/basalt";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { copyChannelText } from "@/lib/channel-reader";

export function CopyTextButton({
	text,
	label,
	disabled,
	className,
}: {
	text: string;
	label: string;
	disabled?: boolean;
	className?: string;
}) {
	const [status, setStatus] = useState("");
	const [copying, setCopying] = useState(false);
	useEffect(() => {
		if (!status) return;
		const timer = setTimeout(() => setStatus(""), 2500);
		return () => clearTimeout(timer);
	}, [status]);
	const Icon = status === "Copied" ? Check : status ? TriangleAlert : Copy;
	return (
		<Button
			variant="outline"
			size="sm"
			className={className}
			disabled={disabled || copying}
			title={status || label}
			onClick={async () => {
				setStatus("");
				setCopying(true);
				setStatus(await copyChannelText(text, navigator.clipboard));
				setCopying(false);
			}}
		>
			<Icon className="h-4 w-4" aria-hidden="true" />
			<span aria-live="polite">
				{status ? (status === "Copied" ? status : "Copy failed") : label}
			</span>
		</Button>
	);
}
