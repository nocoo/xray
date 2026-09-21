export function restoreReadingPosition(
	element: HTMLElement,
	top: number,
	save: (top: number) => void,
) {
	let active = true;
	let applied = element.scrollTop;
	function restore() {
		if (!active) return;
		element.scrollTop = top;
		applied = element.scrollTop;
	}
	function intent() {
		active = false;
	}
	function scroll() {
		if (active && element.scrollTop === applied) return;
		active = false;
		save(element.scrollTop);
	}
	const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
	for (const event of events) element.addEventListener(event, intent, { passive: true });
	element.addEventListener("scroll", scroll);
	element.addEventListener("load", restore, true);
	element.addEventListener("error", restore, true);
	const observer = new ResizeObserver(restore);
	if (element.firstElementChild) observer.observe(element.firstElementChild);
	restore();
	void document.fonts?.ready.then(restore);
	return () => {
		active = false;
		observer.disconnect();
		for (const event of events) element.removeEventListener(event, intent);
		element.removeEventListener("scroll", scroll);
		element.removeEventListener("load", restore, true);
		element.removeEventListener("error", restore, true);
	};
}
