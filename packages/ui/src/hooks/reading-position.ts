export function restoreReadingPosition(
	element: HTMLElement,
	top: number,
	save: (top: number) => void,
	mode: "element" | "document" = "element",
) {
	const target = mode === "document" ? window : element;
	const position = () => (mode === "document" ? window.scrollY : element.scrollTop);
	let active = true;
	let applied = position();
	function restore() {
		if (!active) return;
		if (mode === "document") window.scrollTo({ top, behavior: "instant" });
		else element.scrollTop = top;
		applied = position();
	}
	function intent() {
		active = false;
	}
	function scroll() {
		if (active && position() === applied) return;
		active = false;
		save(position());
	}
	const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
	for (const event of events) target.addEventListener(event, intent, { passive: true });
	target.addEventListener("scroll", scroll);
	element.addEventListener("load", restore, true);
	element.addEventListener("error", restore, true);
	const observer = new ResizeObserver(restore);
	if (element.firstElementChild) observer.observe(element.firstElementChild);
	restore();
	void document.fonts?.ready.then(restore);
	return () => {
		active = false;
		observer.disconnect();
		for (const event of events) target.removeEventListener(event, intent);
		target.removeEventListener("scroll", scroll);
		element.removeEventListener("load", restore, true);
		element.removeEventListener("error", restore, true);
	};
}
