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
 * Normalize JavaScript object literal syntax to valid JSON.
 * Handles unquoted property keys and trailing commas — both common in
 * Twitter data export files produced by certain export pipelines.
 */
function normalizeJsToJson(js: string): string {
  // 1. Quote unquoted property keys:  `following:` → `"following":`
  //    Matches word characters after `{` or `,` (with optional whitespace)
  //    that are followed by `:` but NOT already quoted.
  let json = js.replace(
    /(?<=[{,]\s*)([a-zA-Z_]\w*)\s*:/g,
    '"$1":',
  );
  // 2. Strip trailing commas before `}` or `]`
  json = json.replace(/,\s*([}\]])/g, "$1");
  return json;
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

  // Trim trailing `;` and whitespace (Twitter export files end with `];`)
  const raw = content.slice(jsonStart).replace(/;\s*$/, "");

  // Try standard JSON first, then fall back to JS→JSON normalization
  let data: (FollowingEntry | FollowerEntry)[];
  try {
    data = JSON.parse(raw);
  } catch {
    try {
      data = JSON.parse(normalizeJsToJson(raw));
    } catch {
      return null;
    }
  }

  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  if (!first) return null;

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
}
