const drafts = new Set<symbol>();
let navigationAllowed = false;

export function trackUnsavedDraft(): () => void {
	const id = Symbol();
	drafts.add(id);
	return () => {
		drafts.delete(id);
	};
}

export function hasUnsavedDrafts(): boolean {
	return drafts.size > 0;
}

export function allowDraftNavigation() {
	navigationAllowed = true;
}

export function preventDraftUnload(event: BeforeUnloadEvent) {
	if (hasUnsavedDrafts() && !navigationAllowed) {
		event.preventDefault();
		event.returnValue = "";
	}
}
