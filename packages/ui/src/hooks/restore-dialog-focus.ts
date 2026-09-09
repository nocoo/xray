import { useEffect, useRef } from "react";

/** Restore focus to the control that opened a dialog/sheet. */
export function useRestoreDialogFocus(open: boolean) {
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const wasOpenRef = useRef(false);
	if (open && !wasOpenRef.current) {
		restoreFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
	}
	const closing = wasOpenRef.current && !open;
	wasOpenRef.current = open;

	useEffect(() => {
		if (!closing) return;
		restoreFocusRef.current?.focus();
	}, [closing]);

	return (event: { preventDefault: () => void }) => {
		event.preventDefault();
		restoreFocusRef.current?.focus();
	};
}
