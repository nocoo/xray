"use client";

import { useState, useEffect } from "react";

// =============================================================================
// useColumns — responsive column count via matchMedia change listeners
// Only fires when a breakpoint boundary is actually crossed, not on every
// resize pixel.
//
// Width breakpoints:
//   >= 1920px → 6 cols  (ultra-wide / large external monitor)
//   >= 1536px → 5 cols  (2xl)
//   >= 1280px → 4 cols  (xl)
//   >= 1024px → 3 cols  (lg)
//   >=  640px → 2 cols  (sm)
//   default   → 1 col
//
// Height bonus: on very tall screens (>= 1200px tall) and wide enough
// (>= 1280px), add 1 extra column (capped at 6) to utilise the vertical
// real-estate better.
// =============================================================================

const WIDTH_BREAKPOINTS = [
  { query: "(min-width: 1920px)", cols: 6 },
  { query: "(min-width: 1536px)", cols: 5 }, // 2xl
  { query: "(min-width: 1280px)", cols: 4 }, // xl
  { query: "(min-width: 1024px)", cols: 3 }, // lg
  { query: "(min-width: 640px)", cols: 2 },  // sm
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
        if (widthMqls[i]!.matches) {
          baseCols = WIDTH_BREAKPOINTS[i]!.cols;
          break;
        }
      }

      // Height bonus: +1 column on tall screens (capped at MAX_COLS)
      if (tallMql.matches && baseCols >= 4) {
        baseCols = Math.min(baseCols + 1, MAX_COLS);
      }

      setCols(baseCols);
    }

    calc();

    const handler = () => calc();
    for (const mql of widthMqls) {
      mql.addEventListener("change", handler);
    }
    tallMql.addEventListener("change", handler);

    return () => {
      for (const mql of widthMqls) {
        mql.removeEventListener("change", handler);
      }
      tallMql.removeEventListener("change", handler);
    };
  }, []);

  return cols;
}
