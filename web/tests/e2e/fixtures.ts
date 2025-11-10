import { test as base, Page } from "@playwright/test";
import { injectAxe, checkA11y, getViolations } from "axe-playwright";

/**
 * Extended test fixture with accessibility testing capabilities.
 * Provides a makeAxeBuilder function to inject axe-core and prepare pages for a11y testing.
 * 
 * @example
 * ```typescript
 * test("my a11y test", async ({ page, makeAxeBuilder }) => {
 *   await page.goto("/");
 *   const axePage = await makeAxeBuilder();
 *   await checkA11y(axePage);
 * });
 * ```
 */
type AccessibilityFixtures = {
  makeAxeBuilder: () => Promise<Page>;
};

export const test = base.extend<AccessibilityFixtures>({
  makeAxeBuilder: async ({ page }, use) => {
    const axeBuilder = async () => {
      await injectAxe(page);
      return page;
    };
    await use(axeBuilder);
  },
});

/**
 * Helper to check accessibility on a page.
 */
export async function checkPageAccessibility(page: any, context?: any) {
  await injectAxe(page);
  await checkA11y(page, context, {
    detailedReport: true,
    detailedReportOptions: {
      html: true,
    },
  });
}

/**
 * Helper to get accessibility violations without failing the test.
 */
export async function getAccessibilityViolations(page: any) {
  await injectAxe(page);
  return await getViolations(page);
}

export { expect } from "@playwright/test";
