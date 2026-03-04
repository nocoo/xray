// =============================================================================
// Twitter export file parser
//
// Twitter data export produces files like:
//   following.js:  window.YTD.following.part0 = [ { following: { accountId: "123", ... } }, ... ]
//   follower.js:   window.YTD.follower.part0  = [ { follower:  { accountId: "123", ... } }, ... ]
//
// We strip the assignment prefix, parse as JSON, and extract accountIds.
// =============================================================================

interface FollowingEntry {
  following: { accountId: string; userLink?: string };
}

interface FollowerEntry {
  follower: { accountId: string; userLink?: string };
}

/**
 * Parse a Twitter data export `following.js` or `follower.js` file and extract accountIds.
 * Returns an array of accountId strings, or null if the content is not
 * a valid Twitter export format.
 */
export function parseTwitterExportFile(content: string): string[] | null {
  // Strip the `window.YTD.<type>.partN = ` prefix
  const jsonStart = content.indexOf("[");
  if (jsonStart === -1) return null;

  try {
    const data = JSON.parse(content.slice(jsonStart)) as (FollowingEntry | FollowerEntry)[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0]!;

    // following.js format
    if ("following" in first && first.following?.accountId) {
      return (data as FollowingEntry[])
        .map((entry) => entry.following?.accountId)
        .filter((id): id is string => !!id);
    }

    // follower.js format
    if ("follower" in first && first.follower?.accountId) {
      return (data as FollowerEntry[])
        .map((entry) => entry.follower?.accountId)
        .filter((id): id is string => !!id);
    }

    return null;
  } catch {
    return null;
  }
}
