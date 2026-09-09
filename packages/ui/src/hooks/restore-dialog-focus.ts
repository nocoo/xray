import { useEffect, useRef } from "react";

/** Restore focus to the control that opened a dialog/sheet. */
export function useRestoreDialogFocus(open: boolean) {
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const wasOpenRef = useRef(false);

	useEffect(() => {
		if (open) {
			if (!wasOpenRef.current) {
				restoreFocusRef.current =
					document.activeElement instanceof HTMLElement ? document.activeElement : null;
			}
			wasOpenRef.current = true;
			return;
		}
		if (!wasOpenRef.current) return;
		wasOpenRef.current = false;
		restoreFocusRef.current?.focus();
	}, [open]);

	return (event: { preventDefault: () => void }) => {
		event.preventDefault();
		restoreFocusRef.current?.focus();
	};
}
