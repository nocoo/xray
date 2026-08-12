import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export type SlidePanelProps = {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	/** Tailwind width classes; default full-width up to w-80 */
	width?: string;
	/** Optional test id on the dialog surface */
	"data-testid"?: string;
};

/** Right-edge slide-in panel (legacy v1 watchlist Settings / Activity). */
export function SlidePanel({
	open,
	onClose,
	title,
	children,
	width = "w-full max-w-80",
	"data-testid": testId,
}: SlidePanelProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const titleId = useId();
	const previouslyFocused = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	// Body scroll lock while open
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const panel = panelRef.current;
		if (!panel) return;

		previouslyFocused.current = document.activeElement as HTMLElement | null;

		const focusables = () =>
			[...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
				(el) =>
					!el.hasAttribute("disabled") &&
					el.getAttribute("aria-disabled") !== "true" &&
					el.tabIndex !== -1,
			);

		const initial = focusables();
		(initial[0] ?? panel).focus();

		// Re-query on every Tab so controls that enable after open (e.g. Refresh)
		// enter the trap without remounting the panel.
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;
			const nodes = focusables();
			if (nodes.length === 0) return;
			const first = nodes[0];
			const last = nodes[nodes.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first || !panel.contains(document.activeElement)) {
					e.preventDefault();
					last?.focus();
				}
			} else if (document.activeElement === last || !panel.contains(document.activeElement)) {
				e.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			previouslyFocused.current?.focus?.();
		};
	}, [open]);

	// Unmount when closed so off-screen controls never enter tab order / a11y tree.
	if (!open) return null;

	return (
		<>
			<button
				type="button"
				tabIndex={-1}
				aria-label="Close panel backdrop"
				className="fixed inset-0 z-40 bg-black/30"
				onClick={onClose}
			/>
			<div
				ref={panelRef}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				data-testid={testId}
				className={cn(
					"fixed top-0 right-0 z-50 flex h-full flex-col border-l border-border bg-background shadow-lg outline-none",
					"animate-in slide-in-from-right duration-200",
					width,
				)}
			>
				<div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
					<h2 id={titleId} className="text-sm font-semibold">
						{title}
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label="Close panel"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
			</div>
		</>
	);
}
