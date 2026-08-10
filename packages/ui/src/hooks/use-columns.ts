import { useEffect, useState } from "react";

/** Responsive masonry column count (legacy v1 breakpoints). */
const WIDTH_BREAKPOINTS = [
	{ query: "(min-width: 2560px)", cols: 6 },
	{ query: "(min-width: 2048px)", cols: 5 },
	{ query: "(min-width: 1536px)", cols: 4 },
	{ query: "(min-width: 1024px)", cols: 3 },
	{ query: "(min-width: 768px)", cols: 2 },
];

const TALL_SCREEN_QUERY = "(min-height: 1200px) and (min-width: 1280px)";
const MAX_COLS = 6;

export function useColumns(): number {
	const [cols, setCols] = useState(1);

	useEffect(() => {
		const widthMqls = WIDTH_BREAKPOINTS.map((bp) => window.matchMedia(bp.query));
		const tallMql = window.matchMedia(TALL_SCREEN_QUERY);

		function calc() {
			let baseCols = 1;
			for (let i = 0; i < widthMqls.length; i++) {
				if (widthMqls[i]?.matches) {
					baseCols = WIDTH_BREAKPOINTS[i]?.cols ?? 1;
					break;
				}
			}
			if (tallMql.matches && baseCols >= 5) {
				baseCols = Math.min(baseCols + 1, MAX_COLS);
			}
			setCols(baseCols);
		}

		calc();
		const handler = () => calc();
		for (const mql of widthMqls) mql.addEventListener("change", handler);
		tallMql.addEventListener("change", handler);
		return () => {
			for (const mql of widthMqls) mql.removeEventListener("change", handler);
			tallMql.removeEventListener("change", handler);
		};
	}, []);

	return cols;
}
