/**
 * Migrate existing watchlist members to twitter_profiles.
 *
 * Resolves all unique twitter_username values from watchlist_members,
 * fetches their profile data from TweAPI, upserts into twitter_profiles,
 * and backfills watchlist_members.twitter_id.
 *
 * Usage: bun scripts/migrate-profiles.ts
 *
 * Options:
 *   --dry-run    Print what would be done without writing to the DB.
 *   --db <path>  Override database path (default: database/xray.db).
 */
import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TWEAPI_KEY = process.env.TWEAPI_KEY;
if (!TWEAPI_KEY) {
  console.error("Error: TWEAPI_KEY environment variable is required");
  process.exit(1);
}
const TWEAPI_BASE = "https://api.tweapi.io";
const CONCURRENCY = 5;
const TIMEOUT_MS = 15_000;

// Parse CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dbIdx = args.indexOf("--db");
const dbPath = dbIdx !== -1 && args[dbIdx + 1]
  ? resolve(args[dbIdx + 1])
  : resolve(__dirname, "../database/xray.db");

// ---------------------------------------------------------------------------
// TweAPI client (minimal, self-contained)
// ---------------------------------------------------------------------------

interface UserInfo {
  id: string;
  username: string;
  name: string;
  description?: string;
  location?: string;
  profile_image_url: string;
  profile_banner_url?: string;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  like_count: number;
  is_verified: boolean;
  created_at: string;
  pinned_tweet_id?: string;
}

async function fetchUserInfo(username: string): Promise<UserInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${TWEAPI_BASE}/v1/twitter/user/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TWEAPI_KEY,
      },
      body: JSON.stringify({ url: `https://x.com/${username}` }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const d = json.data;
    // Field names match TweAPI response (camelCase) — see normalizer.ts
    return {
      id: d.id ?? "",
      username: (d.userName ?? "").toLowerCase(),
      name: d.fullName ?? d.userName ?? "",
      description: d.description ?? undefined,
      location: d.location ?? undefined,
      profile_image_url: (d.profileImage ?? "").replace("_normal", "_400x400"),
      profile_banner_url: d.profileBanner ?? undefined,
      followers_count: d.followersCount ?? 0,
      following_count: d.followingsCount ?? 0,
      tweet_count: d.statusesCount ?? 0,
      like_count: d.likeCount ?? 0,
      is_verified: Boolean(d.isVerified),
      created_at: d.createdAt ?? "",
      pinned_tweet_id: d.pinnedTweet ?? undefined,
    };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Controlled concurrency helper
// ---------------------------------------------------------------------------

async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`📂 Database: ${dbPath}`);
  console.log(`🔑 TweAPI key: ${TWEAPI_KEY.slice(0, 8)}...`);
  console.log(`${dryRun ? "🔍 DRY RUN — no writes will be performed\n" : ""}`);

  const db = new Database(dbPath);
  db.exec("PRAGMA foreign_keys = ON");

  // Ensure twitter_profiles table + twitter_id column exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS twitter_profiles (
      twitter_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT,
      description TEXT,
      location TEXT,
      profile_image_url TEXT,
      profile_banner_url TEXT,
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      tweet_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      account_created_at TEXT,
      pinned_tweet_id TEXT,
      snapshot_at INTEGER,
      updated_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS twitter_profiles_username_uniq
      ON twitter_profiles (username);
    CREATE INDEX IF NOT EXISTS watchlist_members_twitter_id_idx
      ON watchlist_members (twitter_id);
  `);

  // safeAddColumn for twitter_id
  try {
    db.exec("ALTER TABLE watchlist_members ADD COLUMN twitter_id TEXT REFERENCES twitter_profiles(twitter_id)");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("duplicate column")) throw e;
  }

  // 1. Get all unique usernames from watchlist_members
  const rows = db.prepare(
    "SELECT DISTINCT LOWER(twitter_username) AS username FROM watchlist_members"
  ).all() as Array<{ username: string }>;

  const usernames = rows.map((r) => r.username);
  console.log(`👥 Found ${usernames.length} unique usernames to resolve\n`);

  if (usernames.length === 0) {
    console.log("Nothing to do.");
    db.close();
    return;
  }

  // 2. Check which ones already have profiles
  const existingProfiles = db.prepare(
    "SELECT username FROM twitter_profiles WHERE username IN (" +
    usernames.map(() => "?").join(",") + ")"
  ).all(...usernames) as Array<{ username: string }>;
  const alreadyCached = new Set(existingProfiles.map((r) => r.username));
  const toResolve = usernames.filter((u) => !alreadyCached.has(u));

  console.log(`✅ Already cached: ${alreadyCached.size}`);
  console.log(`🔄 Need to resolve: ${toResolve.length}\n`);

  // 3. Resolve via TweAPI
  const resolved: UserInfo[] = [];
  const failed: Array<{ username: string; error: string }> = [];

  if (toResolve.length > 0 && !dryRun) {
    let done = 0;
    await pMap(
      toResolve,
      async (username, _idx) => {
        try {
          const info = await fetchUserInfo(username);
          resolved.push(info);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          failed.push({ username, error: msg });
        }
        done++;
        if (done % 10 === 0 || done === toResolve.length) {
          process.stdout.write(`  Resolved ${done}/${toResolve.length}\r`);
        }
      },
      CONCURRENCY,
    );
    console.log(); // clear the \r line
  }

  // 4. Upsert into twitter_profiles
  if (!dryRun && resolved.length > 0) {
    const upsert = db.prepare(`
      INSERT INTO twitter_profiles (
        twitter_id, username, display_name, description, location,
        profile_image_url, profile_banner_url,
        followers_count, following_count, tweet_count, like_count,
        is_verified, account_created_at, pinned_tweet_id,
        snapshot_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(twitter_id) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        description = excluded.description,
        location = excluded.location,
        profile_image_url = excluded.profile_image_url,
        profile_banner_url = excluded.profile_banner_url,
        followers_count = excluded.followers_count,
        following_count = excluded.following_count,
        tweet_count = excluded.tweet_count,
        like_count = excluded.like_count,
        is_verified = excluded.is_verified,
        account_created_at = excluded.account_created_at,
        pinned_tweet_id = excluded.pinned_tweet_id,
        snapshot_at = excluded.snapshot_at,
        updated_at = excluded.updated_at
    `);

    const now = Date.now();
    const tx = db.transaction(() => {
      for (const info of resolved) {
        upsert.run(
          info.id,
          info.username.toLowerCase(),
          info.name,
          info.description ?? null,
          info.location ?? null,
          info.profile_image_url,
          info.profile_banner_url ?? null,
          info.followers_count,
          info.following_count,
          info.tweet_count,
          info.like_count,
          info.is_verified ? 1 : 0,
          info.created_at,
          info.pinned_tweet_id ?? null,
          now,
          now,
        );
      }
    });
    tx();
    console.log(`💾 Upserted ${resolved.length} profiles into twitter_profiles`);
  }

  // 5. Backfill watchlist_members.twitter_id
  if (!dryRun) {
    const backfill = db.prepare(`
      UPDATE watchlist_members
      SET twitter_id = (
        SELECT tp.twitter_id
        FROM twitter_profiles tp
        WHERE LOWER(tp.username) = LOWER(watchlist_members.twitter_username)
      )
      WHERE twitter_id IS NULL
    `);
    const result = backfill.run();
    console.log(`🔗 Backfilled twitter_id on ${result.changes} watchlist_members rows`);
  }

  // 6. Report
  console.log("\n" + "=".repeat(60));
  console.log("Migration Report");
  console.log("=".repeat(60));
  console.log(`Total unique usernames: ${usernames.length}`);
  console.log(`Already cached:         ${alreadyCached.size}`);
  console.log(`Newly resolved:         ${resolved.length}`);
  console.log(`Failed to resolve:      ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed usernames:");
    for (const f of failed) {
      console.log(`  @${f.username} — ${f.error}`);
    }
  }

  // Final stats
  const totalProfiles = db.prepare("SELECT COUNT(*) AS cnt FROM twitter_profiles").get() as { cnt: number };
  const linkedMembers = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist_members WHERE twitter_id IS NOT NULL").get() as { cnt: number };
  const unlinkedMembers = db.prepare("SELECT COUNT(*) AS cnt FROM watchlist_members WHERE twitter_id IS NULL").get() as { cnt: number };

  console.log(`\nTotal profiles in cache: ${totalProfiles.cnt}`);
  console.log(`Members with twitter_id: ${linkedMembers.cnt}`);
  console.log(`Members without twitter_id: ${unlinkedMembers.cnt}`);

  db.close();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
