"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsContextValue {
  breadcrumbs: BreadcrumbItem[];
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
}

const BreadcrumbsContext = createContext<BreadcrumbsContextValue | null>(null);

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  return (
    <BreadcrumbsContext.Provider value={{ breadcrumbs, setBreadcrumbs }}>
      {children}
    </BreadcrumbsContext.Provider>
  );
}

/**
 * Set breadcrumbs for the current page. Clears on unmount.
 * Accepts a dependency array — breadcrumbs are updated whenever deps change.
 */
export function useBreadcrumbs(items: BreadcrumbItem[]) {
  const ctx = useContext(BreadcrumbsContext);
  if (!ctx) {
    throw new Error("useBreadcrumbs must be used within BreadcrumbsProvider");
  }

  const { setBreadcrumbs } = ctx;

  // Serialize to avoid stale closures — only update when actual values change
  const serialized = JSON.stringify(items);

  useEffect(() => {
    setBreadcrumbs(JSON.parse(serialized));
    return () => setBreadcrumbs([]);
  }, [serialized, setBreadcrumbs]);
}

export function useBreadcrumbsValue() {
  const ctx = useContext(BreadcrumbsContext);
  if (!ctx) {
    throw new Error(
      "useBreadcrumbsValue must be used within BreadcrumbsProvider",
    );
  }
  return ctx.breadcrumbs;
}
