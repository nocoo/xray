// =============================================================================
// Tag Color Generator — idempotent, stable hash from tag name to HSL color
// =============================================================================

/**
 * Generate a stable, visually distinct HSL color from a tag name.
 * Uses DJB2 hash for deterministic distribution across the hue spectrum.
 * Saturation and lightness are fixed for readability on dark/light themes.
 */
export function generateTagColor(name: string): string {
  const hash = djb2(name.toLowerCase().trim());
  // Distribute across 12 evenly-spaced hue buckets (0, 30, 60, ... 330)
  // This avoids visually similar adjacent hues
  const bucket = Math.abs(hash) % 12;
  const hue = bucket * 30;
  return `hsl(${hue}, 70%, 45%)`;
}

/** DJB2 hash — fast, well-distributed for short strings. */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // force unsigned 32-bit
}
