import {
	createContext,
	type ReactNode,
	useContext,
	useLayoutEffect,
	useMemo,
	useState,
} from "react";
import { createPortal } from "react-dom";

type PageAsideContextValue = {
	slot: HTMLElement | null;
	setSlot: (el: HTMLElement | null) => void;
	open: boolean;
	setOpen: (open: boolean) => void;
};

const PageAsideContext = createContext<PageAsideContextValue | null>(null);

export function PageAsideProvider({ children }: { children: ReactNode }) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	const [open, setOpen] = useState(false);
	const value = useMemo(() => ({ slot, setSlot, open, setOpen }), [slot, open]);
	return <PageAsideContext.Provider value={value}>{children}</PageAsideContext.Provider>;
}

export function usePageAsideHost() {
	const ctx = useContext(PageAsideContext);
	if (!ctx) {
		throw new Error("usePageAsideHost must be used within PageAsideProvider");
	}
	return ctx;
}

export function PageAside({ open, children }: { open: boolean; children: ReactNode }) {
	const ctx = useContext(PageAsideContext);
	const setOpen = ctx?.setOpen;
	const slot = ctx?.slot;
	useLayoutEffect(() => {
		if (!setOpen) return;
		setOpen(open);
		return () => setOpen(false);
	}, [open, setOpen]);
	if (!slot) return null;
	return createPortal(children, slot);
}
