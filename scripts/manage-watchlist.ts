/**
 * Watchlist Management Script
 *
 * Commands:
 *   add <username|url>     - Add a user to the watchlist
 *   remove <username>      - Remove a user from the watchlist
 *   list                   - List all watched users
 *   has <username>         - Check if a user is in the watchlist
 *
 * Usage:
 *   bun run scripts/manage-watchlist.ts add karpathy
 *   bun run scripts/manage-watchlist.ts add https://x.com/karpathy
 *   bun run scripts/manage-watchlist.ts remove karpathy
 *   bun run scripts/manage-watchlist.ts list
 */

import type { WatchlistUser, Watchlist, CommandResult } from "./lib/types";
import {
  nowISO,
  extractUsername,
  isValidUsername,
  normalizeUsername,
  buildProfileUrl,
} from "./lib/utils";
import {
  watchlistAdd,
  watchlistRemove,
  watchlistGet,
  watchlistGetAll,
  watchlistExists,
} from "./lib/watchlist-db";

// =============================================================================
// Core Functions (exported for testing)
// =============================================================================

export async function addUser(input: string): Promise<CommandResult<WatchlistUser>> {
  let username: string;

  if (input.includes("x.com") || input.includes("twitter.com")) {
    const extracted = extractUsername(input);
    if (!extracted) {
      return {
        success: false,
        message: `Invalid URL format: ${input}`,
        error: "INVALID_URL",
      };
    }
    username = extracted;
  } else {
    username = normalizeUsername(input);
  }

  if (!isValidUsername(username)) {
    return {
      success: false,
      message: `Invalid username: ${username}. Must be 1-15 alphanumeric characters or underscores.`,
      error: "INVALID_USERNAME",
    };
  }

  if (watchlistExists(username)) {
    const existing = watchlistGet(username);
    return {
      success: false,
      message: `User @${username} is already in the watchlist.`,
      error: "DUPLICATE",
      data: existing,
    };
  }

  const newUser: WatchlistUser = {
    username,
    url: buildProfileUrl(username),
    added_at: nowISO(),
  };

  watchlistAdd(newUser);

  return {
    success: true,
    message: `Added @${username} to the watchlist.`,
    data: newUser,
  };
}

export async function removeUser(input: string): Promise<CommandResult<WatchlistUser>> {
  const username = normalizeUsername(input);

  const existing = watchlistGet(username);
  if (!existing) {
    return {
      success: false,
      message: `User @${username} is not in the watchlist.`,
      error: "NOT_FOUND",
    };
  }

  watchlistRemove(username);

  return {
    success: true,
    message: `Removed @${username} from the watchlist.`,
    data: existing,
  };
}

export async function listUsers(): Promise<CommandResult<Watchlist>> {
  const users = watchlistGetAll();
  const watchlist: Watchlist = { users };

  if (users.length === 0) {
    return {
      success: true,
      message: "Watchlist is empty.",
      data: watchlist,
    };
  }

  return {
    success: true,
    message: `Found ${users.length} user(s) in the watchlist.`,
    data: watchlist,
  };
}

export async function hasUser(input: string): Promise<CommandResult<boolean>> {
  const username = normalizeUsername(input);
  const found = watchlistExists(username);

  return {
    success: true,
    message: found
      ? `@${username} is in the watchlist.`
      : `@${username} is not in the watchlist.`,
    data: found,
  };
}

// =============================================================================
// CLI Handler
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];

  if (!command) {
    console.log("Usage: bun run scripts/manage-watchlist.ts <command> [param]");
    console.log("Commands: add, remove, list, has");
    process.exit(1);
  }

  let result: CommandResult;

  switch (command) {
    case "add":
      if (!param) {
        console.error("Error: Missing username or URL");
        process.exit(1);
      }
      result = await addUser(param);
      break;

    case "remove":
      if (!param) {
        console.error("Error: Missing username");
        process.exit(1);
      }
      result = await removeUser(param);
      break;

    case "list":
      result = await listUsers();
      if (result.success && result.data) {
        const watchlist = result.data as Watchlist;
        if (watchlist.users.length > 0) {
          console.log("\nWatchlist:");
          watchlist.users.forEach((u, i) => {
            console.log(`  ${i + 1}. @${u.username} (${u.url})`);
          });
          console.log("");
        }
      }
      break;

    case "has":
      if (!param) {
        console.error("Error: Missing username");
        process.exit(1);
      }
      result = await hasUser(param);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }

  // Output JSON result for programmatic use
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

// Run if executed directly
if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
