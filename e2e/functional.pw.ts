import { test, expect } from "@playwright/test";

// =============================================================================
// Browser E2E — Functional tests
//
// Verifies that pages load data correctly from mock provider and display
// meaningful content. Focuses on data presence rather than deep interactions.
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

// ---------------------------------------------------------------------------
// Dashboard — setup checklist + status cards
// ---------------------------------------------------------------------------

test.describe("dashboard", () => {
  test("displays setup checklist and status cards", async ({ page }) => {
    await page.goto("/");

    // Heading
    await expect(page.locator("h1")).toContainText("Hey,");

    // Setup checklist section
    await expect(page.locator("body")).toContainText("Setup Checklist");
    await expect(page.locator("body")).toContainText("Sign in with Google");
    await expect(page.locator("body")).toContainText("Configure API credentials");

    // Status cards load (from /api/credentials, /api/webhooks, /api/usage)
    await expect(page.locator("body")).toContainText("System", { timeout: 10_000 });
    await expect(page.locator("body")).toContainText("Online");
  });
});

// ---------------------------------------------------------------------------
// Analytics — metrics + chart from mock provider
// ---------------------------------------------------------------------------

test.describe("analytics", () => {
  test("displays analytics metrics from mock provider", async ({ page }) => {
    await page.goto("/analytics");

    await expect(page.locator("h1")).toContainText("Analytics");

    // Wait for mock data to load (from /api/explore/analytics)
    // Mock returns: impressions=10000, engagements=500, engagement_rate=5.0
    await expect(page.locator("body")).toContainText("Impressions", { timeout: 10_000 });
    await expect(page.locator("body")).toContainText("Engagements");
    await expect(page.locator("body")).toContainText("Engagement Rate");
    await expect(page.locator("body")).toContainText("Likes");
    await expect(page.locator("body")).toContainText("Retweets");
    await expect(page.locator("body")).toContainText("Followers");

    // Time series section
    await expect(page.locator("body")).toContainText("Daily Trends");
  });
});

// ---------------------------------------------------------------------------
// Usage — stat cards + credits panel
// ---------------------------------------------------------------------------

test.describe("usage", () => {
  test("displays usage stats and credits panel", async ({ page }) => {
    await page.goto("/usage");

    await expect(page.locator("h1")).toContainText("Usage");

    // Stat cards (from /api/usage — fresh DB so values are 0/"Never")
    await expect(page.locator("body")).toContainText("Total Requests", { timeout: 10_000 });
    await expect(page.locator("body")).toContainText("Avg / Day");

    // Credits panel (from /api/credits/usage — mock returns 5 records)
    await expect(page.locator("body")).toContainText("Credits Usage", { timeout: 10_000 });

    // Time range buttons
    await expect(page.getByRole("button", { name: "7d" })).toBeVisible();
    await expect(page.getByRole("button", { name: "30d" })).toBeVisible();
  });

  test("time range buttons update data", async ({ page }) => {
    await page.goto("/usage");

    // Wait for initial load
    await expect(page.locator("body")).toContainText("Total Requests", { timeout: 10_000 });

    // Click 7d button
    await page.getByRole("button", { name: "7d" }).click();

    // Page should still display usage data (no errors)
    await expect(page.locator("body")).toContainText("Total Requests");
  });
});

// ---------------------------------------------------------------------------
// Tweet detail — tweet content + replies
// ---------------------------------------------------------------------------

test.describe("tweet detail", () => {
  test("displays tweet with replies from mock provider", async ({ page }) => {
    await page.goto("/tweets/test-tweet-123");

    // Wait for mock data to load (from /api/explore/tweets/test-tweet-123)
    // Mock returns tweet by @mockuser with 2 replies
    await expect(page.locator("body")).toContainText("mockuser", { timeout: 10_000 });
    await expect(page.locator("body")).toContainText("Mock tweet details");

    // Replies should be visible
    await expect(page.locator("body")).toContainText("2 replies");
    await expect(page.locator("body")).toContainText("replier1");
    await expect(page.locator("body")).toContainText("replier2");
  });
});

// ---------------------------------------------------------------------------
// User profile — user card + tabs with tweets
// ---------------------------------------------------------------------------

test.describe("user profile", () => {
  test("displays user info and recent tweets", async ({ page }) => {
    await page.goto("/users/testuser");

    // User info card (from /api/explore/users?username=testuser)
    await expect(page.locator("body")).toContainText("testuser", { timeout: 10_000 });
    await expect(page.locator("body")).toContainText("mock profile");
    await expect(page.locator("body")).toContainText("San Francisco");

    // Recent tweets tab (from /api/explore/users/tweets?username=testuser)
    await expect(page.locator("body")).toContainText("Mock tweet", { timeout: 10_000 });
  });

  test("tab navigation loads different content", async ({ page }) => {
    await page.goto("/users/testuser");

    // Wait for initial load
    await expect(page.locator("body")).toContainText("testuser", { timeout: 10_000 });

    // Click Timeline tab
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.locator("body")).toContainText("timeline", { timeout: 10_000 });

    // Click Replies tab
    await page.getByRole("button", { name: "Replies" }).click();
    await expect(page.locator("body")).toContainText("reply", { timeout: 10_000 });
  });

  test("search tab searches within user tweets", async ({ page }) => {
    await page.goto("/users/testuser");

    // Wait for initial load
    await expect(page.locator("body")).toContainText("testuser", { timeout: 10_000 });

    // Click Search tab (the tab button, not the form submit)
    const tabs = page.getByRole("button", { name: "Search" });
    await tabs.first().click();

    // Search input should appear
    const searchInput = page.getByPlaceholder(/search.*tweets/i);
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Enter a search query and submit
    await searchInput.fill("hello");
    await searchInput.press("Enter");

    // Mock returns 1 result containing the query
    await expect(page.locator("body")).toContainText("hello", { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Settings — credentials + webhooks + credits CRUD
// ---------------------------------------------------------------------------

test.describe("settings interactions", () => {
  test("displays credits from mock provider", async ({ page }) => {
    await page.goto("/settings");

    // Credits section (from /api/credits — mock returns 8500/10000)
    await expect(page.locator("body")).toContainText("Credits", { timeout: 10_000 });
    await expect(page.locator("body")).toContainText("8,500");
    await expect(page.locator("body")).toContainText("10,000");
  });

  test("can create and see webhook key", async ({ page }) => {
    await page.goto("/settings");

    // Wait for page load
    await expect(page.locator("h1")).toContainText("Settings");

    // Click "New Key" to create a webhook
    await page.getByRole("button", { name: /new key/i }).click();

    // The new key should be displayed (one-time display — 64 hex chars)
    // Also look for "shown once" confirmation text
    await expect(page.locator("body")).toContainText("shown once", { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Watchlist CRUD lifecycle — create → navigate → edit → delete
// ---------------------------------------------------------------------------

test.describe("watchlist CRUD lifecycle", () => {
  test("create watchlist via dialog and land on detail page", async ({
    page,
  }) => {
    await page.goto("/watchlist");

    // Start with empty state
    await expect(page.locator("body")).toContainText("No watchlists yet", {
      timeout: 10_000,
    });

    // Open create dialog
    await page.getByRole("button", { name: "New Watchlist" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Fill in the form
    await page.getByPlaceholder("e.g. Crypto KOLs").fill("Test Watchlist");
    await page
      .getByPlaceholder("What this watchlist tracks")
      .fill("E2E test watchlist");

    // Pick an icon
    await page.getByRole("button", { name: "Pick an icon" }).click();
    await page.getByRole("button", { name: "rocket" }).click();

    // Auto-translate should be on by default
    const toggle = page.getByRole("switch");
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // Submit
    await page.getByRole("button", { name: "Create" }).click();

    // Should navigate to the new watchlist detail page
    await page.waitForURL(/\/watchlist\/\d+/, { timeout: 10_000 });

    // Detail page should show the watchlist name
    await expect(page.locator("body")).toContainText("Test Watchlist");
  });

  test("edit watchlist name and description", async ({ page }) => {
    // First create a watchlist
    await page.goto("/watchlist");
    await page.getByRole("button", { name: "New Watchlist" }).click();
    await page.getByPlaceholder("e.g. Crypto KOLs").fill("To Edit");
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/watchlist\/\d+/, { timeout: 10_000 });

    // Navigate back to listing
    await page.goto("/watchlist");
    await expect(page.locator("body")).toContainText("To Edit", {
      timeout: 10_000,
    });

    // Hover over the card to reveal edit button
    const card = page.locator("a", { hasText: "To Edit" });
    await card.hover();
    await card.locator('button[title="Edit"]').click();

    // Edit dialog should open
    await expect(page.getByRole("dialog")).toBeVisible();

    // Update the name
    const nameInput = page.getByPlaceholder("e.g. Crypto KOLs");
    await nameInput.clear();
    await nameInput.fill("Edited Watchlist");

    // Update description
    await page
      .getByPlaceholder("What this watchlist tracks")
      .fill("Updated description");

    // Save
    await page.getByRole("button", { name: "Save" }).click();

    // Dialog should close and updated name should appear
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText("Edited Watchlist");
  });

  test("delete watchlist via confirmation dialog", async ({ page }) => {
    // First create a watchlist
    await page.goto("/watchlist");
    await page.getByRole("button", { name: "New Watchlist" }).click();
    await page.getByPlaceholder("e.g. Crypto KOLs").fill("To Delete");
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/watchlist\/\d+/, { timeout: 10_000 });

    // Navigate back to listing
    await page.goto("/watchlist");
    await expect(page.locator("body")).toContainText("To Delete", {
      timeout: 10_000,
    });

    // Hover over the card to reveal delete button
    const card = page.locator("a", { hasText: "To Delete" });
    await card.hover();
    await card.locator('button[title="Delete"]').click();

    // Delete confirmation dialog
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("body")).toContainText("permanently delete");

    // Confirm deletion
    await page.getByRole("button", { name: "Delete" }).click();

    // Dialog should close and watchlist should be gone
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("body")).not.toContainText("To Delete");
  });

  test("?new=1 query param auto-opens create dialog", async ({ page }) => {
    await page.goto("/watchlist?new=1");

    // Dialog should auto-open
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText("New Watchlist");
  });
});

// ---------------------------------------------------------------------------
// Watchlist member CRUD + tag flow
// ---------------------------------------------------------------------------

test.describe("watchlist member CRUD", () => {
  /**
   * Helper: create a watchlist and return its detail page URL.
   * Every test in this describe block gets a fresh watchlist.
   */
  async function createWatchlist(
    page: import("@playwright/test").Page,
    name: string,
  ) {
    await page.goto("/watchlist");
    await page.getByRole("button", { name: "New Watchlist" }).click();
    await page.getByPlaceholder("e.g. Crypto KOLs").fill(name);
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/watchlist\/\d+/, { timeout: 10_000 });
  }

  test("add member to watchlist", async ({ page }) => {
    await createWatchlist(page, "Member Test WL");

    // Should be on the detail page with 0 members
    await expect(page.locator("body")).toContainText("Member Test WL");

    // Click "Add User"
    await page.getByRole("button", { name: "Add User" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Fill in username and note
    await page.getByPlaceholder("elonmusk").fill("testmember");
    await page
      .getByPlaceholder("Why are you tracking this user?")
      .fill("E2E test member");

    // Submit
    await page.getByRole("button", { name: "Add" }).click();

    // Dialog should close and member should appear
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText("@testmember", {
      timeout: 10_000,
    });
    await expect(page.locator("body")).toContainText("E2E test member");
  });

  test("add member with inline tag creation", async ({ page }) => {
    await createWatchlist(page, "Tag Test WL");

    // Add a member with a new tag
    await page.getByRole("button", { name: "Add User" }).click();
    await page.getByPlaceholder("elonmusk").fill("taggeduser");

    // Create a new tag inline
    const tagInput = page.getByPlaceholder("New tag name...");
    await tagInput.fill("VIP");
    await tagInput.press("Enter");

    // The new tag should appear as selected
    await expect(page.locator("body")).toContainText("VIP");

    // Submit the member
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });

    // Member should appear with the tag
    await expect(page.locator("body")).toContainText("@taggeduser", {
      timeout: 10_000,
    });
    await expect(page.locator("body")).toContainText("VIP");
  });

  test("edit member note", async ({ page }) => {
    await createWatchlist(page, "Edit Member WL");

    // Add a member first
    await page.getByRole("button", { name: "Add User" }).click();
    await page.getByPlaceholder("elonmusk").fill("editmember");
    await page
      .getByPlaceholder("Why are you tracking this user?")
      .fill("Original note");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText("@editmember", {
      timeout: 10_000,
    });

    // Hover over member card and click edit
    const memberCard = page.locator("div", { hasText: "@editmember" }).first();
    await memberCard.hover();
    await memberCard.locator('button[title="Edit"]').click({ force: true });

    // Edit dialog should open
    await expect(page.getByRole("dialog")).toBeVisible();

    // Update the note
    const noteInput = page.getByPlaceholder(
      "Why are you tracking this user?",
    );
    await noteInput.clear();
    await noteInput.fill("Updated note");

    // Save
    await page.getByRole("button", { name: "Save" }).click();

    // Dialog should close and updated note should appear
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText("Updated note", {
      timeout: 10_000,
    });
  });

  test("remove member from watchlist", async ({ page }) => {
    await createWatchlist(page, "Remove Member WL");

    // Add a member first
    await page.getByRole("button", { name: "Add User" }).click();
    await page.getByPlaceholder("elonmusk").fill("removeme");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText("@removeme", {
      timeout: 10_000,
    });

    // Hover over member card and click remove
    const memberCard = page.locator("div", { hasText: "@removeme" }).first();
    await memberCard.hover();
    await memberCard.locator('button[title="Remove"]').click({ force: true });

    // Confirmation dialog
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("body")).toContainText("Remove @removeme?");

    // Confirm removal
    await page.getByRole("button", { name: "Remove" }).click();

    // Dialog should close and member should be gone
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    await expect(page.locator("body")).not.toContainText("@removeme");
  });
});
