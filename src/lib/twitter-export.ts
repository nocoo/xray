// =============================================================================
// Twitter export file parser
//
// Twitter data export produces `following.js` with format:
//   window.YTD.following.part0 = [ { following: { accountId: "123", ... } }, ... ]
// We strip the assignment prefix, parse as JSON, and extract accountIds.
// =============================================================================

export interface TwitterExportEntry {
  following: { accountId: string; userLink?: string };
}

/**
 * Parse a Twitter data export `following.js` file and extract accountIds.
 * Returns an array of accountId strings, or null if the content is not
 * a valid Twitter export format.
 */
export function parseTwitterExportFile(content: string): string[] | null {
  // Strip the `window.YTD.following.partN = ` prefix
  const jsonStart = content.indexOf("[");
  if (jsonStart === -1) return null;

  try {
    const data = JSON.parse(content.slice(jsonStart)) as TwitterExportEntry[];
    if (!Array.isArray(data) || data.length === 0) return null;

    // Validate shape: first entry should have following.accountId
    if (!data[0]?.following?.accountId) return null;

    return data
      .map((entry) => entry.following?.accountId)
      .filter((id): id is string => !!id);
  } catch {
    return null;
  }
}
