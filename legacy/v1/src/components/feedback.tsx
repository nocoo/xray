import { Banner } from "@nocoo/basalt/components/banner";
import { Empty } from "@nocoo/basalt/components/empty";
import { Loader } from "@nocoo/basalt/components/loader";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import type { LucideIcon } from "@nocoo/basalt/icons";

export function LoadingSpinner({
	className = "py-12",
	size = "md",
}: {
	className?: string;
	size?: "sm" | "md" | "lg";
}) {
	const sizePx = size === "sm" ? 16 : size === "lg" ? 32 : 24;
	return (
		<div className={`flex items-center justify-center ${className}`}>
			<Loader size={sizePx} showLabel={false} showElapsed={false} />
		</div>
	);
}

export function ErrorBanner({ error }: { error: string }) {
	return <Banner variant="error" size="sm" description={error} />;
}

export function StatusMessage({ type, text }: { type: "success" | "error"; text: string }) {
	return (
		<Banner variant={type === "error" ? "error" : "default"} size="sm" description={text} />
	);
}

export function EmptyState({
	icon: Icon,
	title,
	subtitle,
}: {
	icon: LucideIcon;
	title: string;
	subtitle?: string;
}) {
	return <Empty title={title} description={subtitle} icon={<Icon strokeWidth={1.5} />} />;
}

export function SectionSkeleton({ title }: { title: string }) {
	return (
		<section className="space-y-4">
			<h2 className="text-lg font-semibold">{title}</h2>
			<div className="space-y-3">
				<SkeletonLine className="h-4 w-3/4" />
				<SkeletonLine className="h-24 rounded-card" />
			</div>
		</section>
	);
}
