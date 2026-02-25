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
