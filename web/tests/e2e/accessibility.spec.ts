import { test, expect } from "./fixtures";
import { injectAxe, checkA11y } from "axe-playwright";

test.describe("Accessibility Tests @a11y", () => {
  test("home page should be accessible", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]', { timeout: 10000 });

    // Inject axe-core
    await injectAxe(page);

    // Run accessibility checks
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true,
      },
    });
  });

  test("navigation should be keyboard accessible", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    // Tab through focusable elements
    await page.keyboard.press("Tab");
    let focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();

    // Continue tabbing
    await page.keyboard.press("Tab");
    focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();

    // Should be able to navigate back with Shift+Tab
    await page.keyboard.press("Shift+Tab");
    focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });

  test("interactive elements should have visible focus indicators", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    // Get all buttons
    const buttons = page.locator("button");
    const buttonCount = await buttons.count();

    // Check first few buttons for focus styles
    for (let i = 0; i < Math.min(3, buttonCount); i++) {
      const button = buttons.nth(i);
      await button.focus();

      // Check that focused element has visible outline or ring
      const styles = await button.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          outline: computed.outline,
          outlineWidth: computed.outlineWidth,
          boxShadow: computed.boxShadow,
        };
      });

      // Should have either outline or box-shadow (focus ring)
      const hasFocusIndicator =
        styles.outlineWidth !== "0px" || styles.boxShadow !== "none";
      expect(hasFocusIndicator).toBe(true);
    }
  });

  test("images should have alt text", async ({ page }) => {
    await page.goto("/");

    const images = page.locator("img");
    const imageCount = await images.count();

    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");

      // All images should have alt attribute (can be empty for decorative)
      expect(alt).not.toBeNull();
    }
  });

  test("form inputs should have labels", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    const inputs = page.locator('input[type="text"], input[type="email"]');
    const inputCount = await inputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);

      // Check for associated label via aria-label or aria-labelledby
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const id = await input.getAttribute("id");

      let hasLabel = false;

      if (ariaLabel || ariaLabelledBy) {
        hasLabel = true;
      } else if (id) {
        // Check for label element
        const label = page.locator(`label[for="${id}"]`);
        hasLabel = (await label.count()) > 0;
      }

      expect(hasLabel).toBe(true);
    }
  });

  test("color contrast should meet WCAG AA standards", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    await injectAxe(page);

    // Check specifically for color contrast issues
    await checkA11y(
      page,
      null,
      {
        detailedReport: true,
      },
      false,
      {
        runOnly: ["color-contrast"],
      }
    );
  });

  test("heading hierarchy should be logical", async ({ page }) => {
    await page.goto("/");

    // Get all headings
    const headings = await page.locator("h1, h2, h3, h4, h5, h6").all();

    if (headings.length > 0) {
      // Should have exactly one h1
      const h1Count = await page.locator("h1").count();
      expect(h1Count).toBe(1);

      // Check heading levels don't skip
      const levels: number[] = [];
      for (const heading of headings) {
        const tagName = await heading.evaluate((el) => el.tagName);
        const level = parseInt(tagName.substring(1));
        levels.push(level);
      }

      // First heading should be h1
      expect(levels[0]).toBe(1);

      // No skipping levels (e.g., h1 -> h3)
      for (let i = 1; i < levels.length; i++) {
        const diff = levels[i] - levels[i - 1];
        expect(diff).toBeLessThanOrEqual(1);
      }
    }
  });

  test("ARIA roles should be used correctly", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    await injectAxe(page);

    // Check for ARIA-related violations
    await checkA11y(
      page,
      null,
      {
        detailedReport: true,
      },
      false,
      {
        runOnly: ["aria"],
      }
    );
  });

  test("landmarks should be present for navigation", async ({ page }) => {
    await page.goto("/");

    // Check for common landmarks
    const main = page.locator('main, [role="main"]');
    await expect(main).toHaveCount(1);

    // Should have navigation if present
    const nav = page.locator('nav, [role="navigation"]');
    if ((await nav.count()) > 0) {
      await expect(nav.first()).toBeVisible();
    }
  });

  test("dialogs should trap focus", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    // Try to open a dialog (adjust selector based on your UI)
    const dialogTrigger = page.locator('button:has-text("Add")').first();

    if (await dialogTrigger.isVisible()) {
      await dialogTrigger.click();

      // Wait for dialog
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 2000 });

      // Tab through elements - focus should stay in dialog
      const initialFocus = page.locator(":focus");
      const initialElement = await initialFocus.evaluate(
        (el) => el.tagName + el.className
      );

      // Tab multiple times
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
      }

      // Focus should still be within the dialog
      const currentFocus = page.locator(":focus");
      const isInDialog = await currentFocus.evaluate((el) => {
        let parent = el.parentElement;
        while (parent) {
          if (parent.getAttribute("role") === "dialog") return true;
          parent = parent.parentElement;
        }
        return false;
      });

      expect(isInDialog).toBe(true);
    }
  });

  test("screen reader announcements for dynamic content", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[role="grid"]');

    // Check for aria-live regions for dynamic updates
    const liveRegions = page.locator('[aria-live], [role="status"]');

    // If there are live regions, they should have appropriate politeness
    const liveRegionCount = await liveRegions.count();
    for (let i = 0; i < liveRegionCount; i++) {
      const region = liveRegions.nth(i);
      const ariaLive = await region.getAttribute("aria-live");

      // Should be either 'polite', 'assertive', or have role="status"
      const role = await region.getAttribute("role");
      expect(
        ariaLive === "polite" ||
          ariaLive === "assertive" ||
          role === "status" ||
          role === "alert"
      ).toBe(true);
    }
  });
});
