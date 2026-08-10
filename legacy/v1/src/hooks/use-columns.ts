"use client";

import { useState, useEffect } from "react";

// =============================================================================
// useColumns — responsive column count via matchMedia change listeners
// Only fires when a breakpoint boundary is actually crossed, not on every
// resize pixel.
//
// Width breakpoints (optimised for ~300-400px card width after sidebar):
//   >= 2560px → 6 cols  (27" external monitor)
//   >= 2048px → 5 cols  (large desktop)
//   >= 1536px → 4 cols  (2xl / MacBook full-screen)
//   >= 1024px → 3 cols  (lg)
//   >=  768px → 2 cols  (md / tablet)
//   default   → 1 col
//
// 3/4/5-col breakpoints are evenly spaced at ~512px intervals across
// the 1024–2560px range for balanced coverage.
//
// Height bonus: on very tall screens (>= 1200px tall) and wide enough
// (>= 1280px), add 1 extra column (capped at 6) to utilise the vertical
// real-estate better. Only kicks in at 5+ base cols so that 4-col range
// stays visible.
// =============================================================================

const WIDTH_BREAKPOINTS = [
  { query: "(min-width: 2560px)", cols: 6 }, // 27" / QHD
  { query: "(min-width: 2048px)", cols: 5 }, // large desktop
  { query: "(min-width: 1536px)", cols: 4 }, // 2xl
  { query: "(min-width: 1024px)", cols: 3 }, // lg
  { query: "(min-width: 768px)", cols: 2 },  // md
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

      // Height bonus: +1 column on tall screens (capped at MAX_COLS)
      // Only kicks in at 5+ base cols so that 4-col range stays visible.
      if (tallMql.matches && baseCols >= 5) {
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
