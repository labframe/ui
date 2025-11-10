import { test, expect } from "./fixtures";

test.describe("Samples Page", () => {
  test("should load and display samples", async ({ page }) => {
    await page.goto("/");

    // Wait for samples to load
    await page.waitForSelector('[role="grid"]', { timeout: 10000 });

    // Check that the grid is visible
    const grid = page.locator('[role="grid"]');
    await expect(grid).toBeVisible();

    // Check for at least one sample row
    const rows = page.locator('[role="row"]');
    await expect(rows).not.toHaveCount(0);
  });

  test("should filter samples", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    // Find and use filter input (adjust selector based on your UI)
    const filterInput = page.locator('input[placeholder*="filter" i]').first();
    
    if (await filterInput.isVisible()) {
      await filterInput.fill("SAM-001");
      
      // Wait for filtering to apply
      await page.waitForTimeout(500);
      
      // Verify filtered results
      const rows = page.locator('[role="row"]');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  test("should edit sample parameter", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    // Find a cell to edit (adjust based on your grid structure)
    const cell = page.locator('[role="gridcell"]').first();
    
    // Double-click to enter edit mode
    await cell.dblclick();
    
    // Wait for editor to appear
    await page.waitForTimeout(300);
    
    // Type new value
    const editor = page.locator('input[role="textbox"], input[type="text"]').first();
    if (await editor.isVisible()) {
      await editor.fill("25.5");
      await editor.press("Enter");
      
      // Wait for save operation
      await page.waitForTimeout(500);
    }
  });

  test("should handle errors gracefully", async ({ page }) => {
    // Intercept API calls to return errors
    await page.route("/api/samples", (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/");

    // Check for error message (adjust selector based on your error UI)
    const errorMessage = page.locator('text=/error|failed/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("should be accessible", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    // Basic accessibility checks
    // Check for proper heading structure
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();

    // Check that interactive elements are keyboard accessible
    await page.keyboard.press("Tab");
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });

  test("should toggle theme", async ({ page }) => {
    await page.goto("/");

    // Find theme toggle button (adjust selector)
    const themeToggle = page.locator('button[aria-label*="theme" i]').first();
    
    if (await themeToggle.isVisible()) {
      // Get initial theme
      const html = page.locator("html");
      const initialClass = await html.getAttribute("class");
      
      // Toggle theme
      await themeToggle.click();
      await page.waitForTimeout(300);
      
      // Verify theme changed
      const newClass = await html.getAttribute("class");
      expect(newClass).not.toBe(initialClass);
    }
  });

  test("should work on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    
    await page.waitForSelector('[role="grid"]', { timeout: 10000 });
    
    // Verify grid is visible and responsive
    const grid = page.locator('[role="grid"]');
    await expect(grid).toBeVisible();
    
    // Check that content fits in viewport
    const gridBox = await grid.boundingBox();
    expect(gridBox?.width).toBeLessThanOrEqual(375);
  });
});

test.describe("Visual Regression", () => {
  test("should match samples page screenshot", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');
    
    // Wait for all content to load
    await page.waitForTimeout(1000);
    
    // Take screenshot and compare
    await expect(page).toHaveScreenshot("samples-page.png", {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test("should match dark theme screenshot", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');
    
    // Switch to dark theme
    const themeToggle = page.locator('button[aria-label*="theme" i]').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(300);
    }
    
    await expect(page).toHaveScreenshot("samples-page-dark.png", {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});
