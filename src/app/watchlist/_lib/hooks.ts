"use client";

import { useState, useEffect } from "react";

// =============================================================================
// useColumns — responsive column count via matchMedia change listeners
// Only fires when a breakpoint boundary is actually crossed, not on every
// resize pixel.
// =============================================================================

const BREAKPOINTS = [
  { query: "(min-width: 1280px)", cols: 4 }, // xl
  { query: "(min-width: 1024px)", cols: 3 }, // lg
  { query: "(min-width: 640px)", cols: 2 },  // sm
];

export function useColumns(): number {
  const [cols, setCols] = useState(1);

  useEffect(() => {
    const mqls = BREAKPOINTS.map((bp) => window.matchMedia(bp.query));

    function calc() {
      for (let i = 0; i < mqls.length; i++) {
        if (mqls[i]!.matches) {
          setCols(BREAKPOINTS[i]!.cols);
          return;
        }
      }
      setCols(1);
    }

    calc();

    const handler = () => calc();
    for (const mql of mqls) {
      mql.addEventListener("change", handler);
    }
    return () => {
      for (const mql of mqls) {
        mql.removeEventListener("change", handler);
      }
    };
  }, []);

  return cols;
}
