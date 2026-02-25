import { test, expect } from "@playwright/test";

// =============================================================================
// Browser E2E — Smoke tests
//
// Verifies key browser interactions: page loads, navigation, search flows.
// Server runs with MOCK_PROVIDER=true and E2E_SKIP_AUTH=true.
// =============================================================================

// ---------------------------------------------------------------------------
// All pages load without errors
// ---------------------------------------------------------------------------

test.describe("page load smoke tests", () => {
  const pages = [
    { path: "/", title: "Dashboard" },
    { path: "/tweets", title: "Tweets" },
    { path: "/users", title: "Users" },
    { path: "/analytics", title: "Analytics" },
    { path: "/bookmarks", title: "Bookmarks" },
    { path: "/likes", title: "Likes" },
    { path: "/lists", title: "Lists" },
    { path: "/messages", title: "Messages" },
    { path: "/usage", title: "Usage" },
    { path: "/settings", title: "Settings" },
  ];

  for (const { path, title } of pages) {
    test(`${title} (${path}) loads without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // Page should contain the title text somewhere
      await expect(page.locator("body")).toContainText(title);

      // No uncaught JS errors
      expect(errors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Sidebar navigation
// ---------------------------------------------------------------------------

test.describe("sidebar navigation", () => {
  test("navigates between pages via sidebar links", async ({ page }) => {
    await page.goto("/");

    // Click Tweets in sidebar
    await page.getByRole("link", { name: "Tweets" }).click();
    await expect(page).toHaveURL("/tweets");
    await expect(page.locator("h1")).toContainText("Tweets");

    // Click Users in sidebar
    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL("/users");
    await expect(page.locator("h1")).toContainText("Users");

    // Click Settings in sidebar
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL("/settings");
    await expect(page.locator("h1")).toContainText("Settings");

    // Navigate back to Dashboard
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL("/");
  });
});

// ---------------------------------------------------------------------------
// Tweets search flow
// ---------------------------------------------------------------------------

test.describe("tweets search", () => {
  test("search returns results from mock provider", async ({ page }) => {
    await page.goto("/tweets");

    // Empty state should be visible
    await expect(page.locator("body")).toContainText("Enter a search query");

    // Type a query and submit
    const searchInput = page.getByPlaceholder(/search tweets/i);
    await searchInput.fill("ai agents");
    await page.getByRole("button", { name: "Search" }).click();

    // Results should appear (mock provider returns data for any query)
    await expect(page.locator("body")).toContainText("result", { timeout: 10_000 });
  });

  test("search with empty query does not submit", async ({ page }) => {
    await page.goto("/tweets");

    // Search button should be disabled when input is empty
    const searchButton = page.getByRole("button", { name: "Search" });
    await expect(searchButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Users search flow
// ---------------------------------------------------------------------------

test.describe("users search", () => {
  test("search returns user profile from mock provider", async ({ page }) => {
    await page.goto("/users");

    // Empty state should be visible
    await expect(page.locator("body")).toContainText("Enter a username");

    // Type a username and submit
    const searchInput = page.getByPlaceholder(/username/i);
    await searchInput.fill("testuser");
    await page.getByRole("button", { name: "Look up" }).click();

    // Profile info should appear (mock provider returns deterministic data)
    await expect(page.locator("body")).toContainText("testuser", { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Settings page sections
// ---------------------------------------------------------------------------

test.describe("settings page", () => {
  test("renders all configuration sections", async ({ page }) => {
    await page.goto("/settings");

    // Verify key sections are rendered
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.locator("body")).toContainText("Credits");
    await expect(page.locator("body")).toContainText("API Credentials");
    await expect(page.locator("body")).toContainText("Webhook");
  });
});
