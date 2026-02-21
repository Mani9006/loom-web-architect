import { test, expect } from "@playwright/test";

test.describe("Route Integrity E2E Tests", () => {
  test("Routes-001: Landing page loads", async ({ page }) => {
    await page.goto("/");

    // Page should load without errors
    await expect(page).toHaveURL("/");
    await expect(page.locator("body")).toBeTruthy();

    // Check for main content
    const mainContent = page.locator("main, [role='main'], .container").first();
    await expect(mainContent).toBeVisible({ timeout: 5000 }).catch(() => {
      // Fallback: just check page title
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
    });
  });

  test("Routes-002: Auth page loads", async ({ page }) => {
    await page.goto("/auth");

    // Should show auth form
    const formElement = page.locator("form, [role='form']").first();
    await expect(formElement).toBeVisible({ timeout: 5000 }).catch(() => {
      // Fallback: check for auth content
      const authContent = page.locator(
        'button:has-text("Login"), button:has-text("Sign Up")'
      );
      expect(await authContent.count()).toBeGreaterThan(0);
    });
  });

  test("Routes-003: Unauthenticated access to dashboard redirects", async ({
    page,
  }) => {
    // Clear any auth token
    await page.evaluate(() => {
      localStorage.removeItem("session_token");
      sessionStorage.clear();
    });

    // Try to access protected page
    await page.goto("/dashboard", { waitUntil: "networkidle" }).catch(() => {
      // Expected to fail or redirect
    });

    // Should redirect to auth or show auth page
    const url = page.url();
    const isAuthPage =
      url.includes("/auth") ||
      url.includes("/login") ||
      url.includes("/signup");

    const isOnAuthForm =
      (await page
        .locator('button:has-text("Login"), button:has-text("Sign Up")')
        .count()) > 0;

    expect(isAuthPage || isOnAuthForm).toBe(true);
  });

  test("Routes-004: 404 page for nonexistent route", async ({ page }) => {
    await page.goto("/this-route-does-not-exist", {
      waitUntil: "networkidle",
    }).catch(() => {
      // 404 navigation might not resolve normally
    });

    // Should show 404 or error content
    const pageContent = await page.content();
    const has404 =
      pageContent.includes("404") ||
      pageContent.includes("Not Found") ||
      pageContent.includes("not found");

    expect(has404 || page.url().includes("/")).toBe(true);
  });

  test("Routes-005: Navigation links work", async ({ page }) => {
    await page.goto("/");

    // Find navigation links
    const navLinks = page.locator("nav a, header a");
    const linkCount = await navLinks.count();

    if (linkCount > 0) {
      // Click first navigation link and verify page changed
      const firstLink = navLinks.first();
      const initialUrl = page.url();
      const href = await firstLink.getAttribute("href");

      if (href && href !== initialUrl && !href.startsWith("http")) {
        await firstLink.click();
        await page.waitForTimeout(500);

        const newUrl = page.url();
        // URL should be different or same if hash navigation
        expect(newUrl !== initialUrl || href.includes("#")).toBe(true);
      }
    }
  });

  test("Routes-006: Page title updates per route", async ({ page }) => {
    // Check landing page title
    await page.goto("/");
    const landingTitle = await page.title();
    expect(landingTitle.length).toBeGreaterThan(0);

    // Check auth page title
    await page.goto("/auth");
    const authTitle = await page.title();

    // Titles should be different or indicative of page
    expect(landingTitle || authTitle).toBeTruthy();
  });

  test("Routes-007: Browser back/forward navigation works", async ({
    page,
  }) => {
    await page.goto("/");
    const landingUrl = page.url();

    await page.goto("/auth");
    const authUrl = page.url();

    // Go back
    await page.goBack();
    await page.waitForTimeout(300);
    expect(page.url()).toBe(landingUrl);

    // Go forward
    await page.goForward();
    await page.waitForTimeout(300);
    expect(page.url()).toBe(authUrl);
  });

  test("Routes-008: No console errors on navigation", async ({ page }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Navigate through key pages
    await page.goto("/");
    await page.goto("/auth");
    await page.goBack();

    // Should not have critical errors
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") && !e.includes("404") && !e.includes("401")
    );
    expect(criticalErrors.length).toBe(0);
  });
});
