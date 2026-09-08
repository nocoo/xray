import { useEffect, useState } from "react";

const TALL_SCREEN_QUERY = "(min-height: 1200px) and (min-width: 1280px)";
const MAX_COLS = 6;

/** Masonry column count from the feed container width, not the window. */
export function columnsForWidth(width: number, tallScreen = false): number {
	let cols = 1;
	if (width >= 2560) cols = 6;
	else if (width >= 2048) cols = 5;
	else if (width >= 1536) cols = 4;
	else if (width >= 1024) cols = 3;
	else if (width >= 768) cols = 2;
	if (tallScreen && cols >= 5) cols = Math.min(cols + 1, MAX_COLS);
	return cols;
}

export function useColumns(el: HTMLElement | null): number {
	const [cols, setCols] = useState(1);

	useEffect(() => {
		if (!el) {
			setCols(1);
			return;
		}
		const tallMql = window.matchMedia(TALL_SCREEN_QUERY);
		const apply = () => setCols(columnsForWidth(el.clientWidth, tallMql.matches));
		apply();
		const ro = new ResizeObserver(apply);
		ro.observe(el);
		tallMql.addEventListener("change", apply);
		return () => {
			ro.disconnect();
			tallMql.removeEventListener("change", apply);
		};
	}, [el]);

	return cols;
}
