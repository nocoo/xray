import { useEffect } from "react";
import { preventDraftUnload, trackUnsavedDraft } from "@/lib/unsaved-drafts";

export function useUnsavedDraft(dirty: boolean) {
	useEffect(() => {
		if (!dirty) return;
		const release = trackUnsavedDraft();
		const prevent = (event: BeforeUnloadEvent) => preventDraftUnload(event);
		window.addEventListener("beforeunload", prevent);
		return () => {
			release();
			window.removeEventListener("beforeunload", prevent);
		};
	}, [dirty]);
}
