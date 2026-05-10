import { expect, type Page, test } from "@playwright/test";

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test.describe("Enterprise screenshot evidence", () => {
  test("captures public landing and auth screenshots across configured browsers", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toBeVisible();
    await attachScreenshot(page, "enterprise-landing-full-page");

    await page.goto("/auth", { waitUntil: "networkidle" });
    await expect(page.locator('button:has-text("Login"), button:has-text("Sign Up")').first()).toBeVisible();
    await attachScreenshot(page, "enterprise-auth-full-page");

    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("favicon") &&
        !error.includes("404") &&
        !error.includes("401") &&
        !error.includes("ERR_NAME_NOT_RESOLVED"),
    );
    expect(criticalErrors).toEqual([]);
  });

  test("captures mobile route-guard evidence for protected enterprise surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard", { waitUntil: "networkidle" }).catch(() => undefined);
    await expect(page.locator("body")).toBeVisible();
    await attachScreenshot(page, "enterprise-mobile-dashboard-route-guard");

    const isAuthRoute = page.url().includes("/auth");
    const hasAuthAction = (await page.locator('button:has-text("Login"), button:has-text("Sign Up")').count()) > 0;
    expect(isAuthRoute || hasAuthAction).toBe(true);
  });
});
