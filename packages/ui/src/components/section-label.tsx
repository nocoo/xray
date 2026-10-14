import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const tones = {
	blue: "bg-basalt-tag-blue text-basalt-tag-blue-foreground",
	green: "bg-basalt-tag-teal text-basalt-tag-teal-foreground",
	amber: "bg-basalt-tag-amber text-basalt-tag-amber-foreground",
	rose: "bg-basalt-tag-rose text-basalt-tag-rose-foreground",
	neutral: "bg-basalt-tag-slate text-basalt-tag-slate-foreground",
};

export function SectionLabel({
	icon: Icon,
	tone = "blue",
	children,
}: {
	icon: LucideIcon;
	tone?: keyof typeof tones;
	children: ReactNode;
}) {
	return (
		<span className="inline-flex min-w-0 items-center gap-3">
			<span
				aria-hidden="true"
				className={`flex size-7 shrink-0 items-center justify-center rounded-basalt-md ${tones[tone]}`}
			>
				<Icon className="size-4" strokeWidth={1.5} />
			</span>
			<span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
		</span>
	);
}
