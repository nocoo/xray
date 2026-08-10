import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { BreadcrumbItem } from "./breadcrumbs";

interface BreadcrumbsContextValue {
	breadcrumbs: BreadcrumbItem[];
	setBreadcrumbs: (items: BreadcrumbItem[]) => void;
}

const BreadcrumbsContext = createContext<BreadcrumbsContextValue | null>(null);

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
	const [breadcrumbs, setBreadcrumbsState] = useState<BreadcrumbItem[]>([]);
	const setBreadcrumbs = useCallback((items: BreadcrumbItem[]) => {
		setBreadcrumbsState(items);
	}, []);
	const value = useMemo(() => ({ breadcrumbs, setBreadcrumbs }), [breadcrumbs, setBreadcrumbs]);
	return <BreadcrumbsContext.Provider value={value}>{children}</BreadcrumbsContext.Provider>;
}

export function useBreadcrumbs() {
	const ctx = useContext(BreadcrumbsContext);
	if (!ctx) {
		throw new Error("useBreadcrumbs must be used within BreadcrumbsProvider");
	}
	return ctx;
}
