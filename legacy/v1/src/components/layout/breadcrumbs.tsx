import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3" />}
            {item.href ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors"
                {...(isLast ? { "aria-current": "page" as const } : {})}
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium" {...(isLast ? { "aria-current": "page" as const } : {})}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
