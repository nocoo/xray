import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

export interface BreadcrumbItem {
	label: string;
	href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
	return (
		<nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
			{items.map((item, index) => {
				const isLast = index === items.length - 1;
				return (
					<span
						key={item.href ?? `crumb-${item.label}-${item.label}`}
						className="flex items-center gap-1"
					>
						{index > 0 && <ChevronRight className="h-3 w-3" />}
						{item.href && !isLast ? (
							<Link to={item.href} className="hover:text-foreground transition-colors">
								{item.label}
							</Link>
						) : (
							<span
								className="text-foreground font-medium"
								aria-current={isLast ? "page" : undefined}
							>
								{item.label}
							</span>
						)}
					</span>
				);
			})}
		</nav>
	);
}
