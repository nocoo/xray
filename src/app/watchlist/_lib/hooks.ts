"use client";

import { useState, useEffect } from "react";

// =============================================================================
// useColumns — responsive column count via matchMedia
// =============================================================================

const BREAKPOINTS = [
  { query: "(min-width: 1280px)", cols: 4 }, // xl
  { query: "(min-width: 1024px)", cols: 3 }, // lg
  { query: "(min-width: 640px)", cols: 2 },  // sm
];

export function useColumns(): number {
  const [cols, setCols] = useState(1);

  useEffect(() => {
    function calc() {
      for (const bp of BREAKPOINTS) {
        if (window.matchMedia(bp.query).matches) {
          setCols(bp.cols);
          return;
        }
      }
      setCols(1);
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return cols;
}
