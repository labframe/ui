import { test, expect } from "./fixtures";

/**
 * CSS Smoke Tests - Lightweight checks to catch broken styling.
 * 
 * These catch major breaks like:
 * - Missing PostCSS config (no Tailwind processing)
 * - Broken CSS imports (missing AG Grid styles)
 * - Theme not loading (missing CSS variables)
 * 
 * NOT intended to verify every style detail - just that CSS pipeline works.
 */

test.describe("CSS Smoke Tests @smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]', { timeout: 10000 });
  });

  test("PostCSS pipeline is working (Tailwind + theme)", async ({ page }) => {
    /**
     * Catches: postcss.config.mjs moved/missing, Tailwind not processing
     */
    const body = page.locator("body");
    
    // Check Tailwind processed (custom properties defined)
    const hasTheme = await page.evaluate(() => {
      const root = document.documentElement;
      const style = window.getComputedStyle(root);
      return {
        background: style.getPropertyValue("--background"),
        foreground: style.getPropertyValue("--foreground"),
      };
    });
    
    expect(hasTheme.background).toBeTruthy();
    expect(hasTheme.foreground).toBeTruthy();
    
    // Check body has processed styles (not browser defaults)
    const bodyStyles = await body.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        backgroundColor: s.backgroundColor,
        fontFamily: s.fontFamily,
        margin: s.margin,
      };
    });
    
    expect(bodyStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(bodyStyles.fontFamily).toBeTruthy();
    expect(bodyStyles.margin).not.toBe("8px"); // Not browser default
  });

  test("AG Grid styles are loaded and applied", async ({ page }) => {
    /**
     * Catches: AG Grid CSS import broken, theme class missing
     */
    const grid = page.locator('[role="grid"]');
    await expect(grid).toBeVisible();

    // Grid should have ag- classes
    const gridClass = await grid.getAttribute("class");
    expect(gridClass).toContain("ag-");

    // Cells should have proper dimensions (not collapsed)
    const firstCell = page.locator('[role="gridcell"]').first();
    const cellBox = await firstCell.boundingBox();
    expect(cellBox).toBeTruthy();
    expect(cellBox!.width).toBeGreaterThan(40);
    expect(cellBox!.height).toBeGreaterThan(20);
    
    // Headers should be styled
    const header = page.locator('[role="columnheader"]').first();
    const headerWeight = await header.evaluate((el) => 
      parseInt(window.getComputedStyle(el).fontWeight)
    );
    expect(headerWeight).toBeGreaterThan(300);
  });

  test("Page is not blank (smoke test)", async ({ page }) => {
    /**
     * Catches: Complete CSS failure, all styling broken
     */
    // Multiple visible elements should exist
    const visibleCount = await page.locator("*:visible").count();
    expect(visibleCount).toBeGreaterThan(10);
    
    // Screenshot should have content
    const screenshot = await page.screenshot();
    expect(screenshot.length).toBeGreaterThan(5000);
  });
});
