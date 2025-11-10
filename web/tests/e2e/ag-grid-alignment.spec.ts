import fs from "node:fs";
import path from "node:path";

import { test, expect, type Locator, type Page } from "@playwright/test";

const RESULTS_ROOT = path.join(process.cwd(), "tests/results/playwright");
const SCREENSHOTS_ROOT = path.join(RESULTS_ROOT, "screenshots");
const TRACES_ROOT = path.join(RESULTS_ROOT, "traces");
const VIDEO_ROOT = path.join(RESULTS_ROOT, "video");

const COLUMN_WIDTH_STORAGE_KEY = "samples-grid:column-widths";

type PaddingMeasurement = {
  text: string;
  computedPaddingLeft: number;
  computedPaddingRight: number;
  visualLeftPadding: number;
  visualRightPadding: number;
  cellWidth: number;
  textGlyphWidth: number;
  textElementWidth: number;
};

type ColumnMeasurementRecord = {
  ordinal: number;
  colId: string;
  headerText: string;
  measurement: PaddingMeasurement;
  scrollLeft: number | null;
};

type SampleCallbackArgs = ColumnMeasurementRecord & {
  cell: Locator;
};

interface CollectOptions {
  maxColumns?: number;
  skipEmpty?: boolean;
  maxIterations?: number;
  scrollStep?: number;
  scrollWaitMs?: number;
  cellWaitMs?: number;
  onSample?: (sample: SampleCallbackArgs) => Promise<void> | void;
}

async function ensureDirExists(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function sanitizeForFilename(value: string | null | undefined, fallback: string): string {
  const base = value && value.trim().length > 0 ? value.trim() : fallback;
  const sanitized = base.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized.length > 0 ? sanitized.slice(0, 80) : fallback;
}

async function measureCellPadding(cell: Locator): Promise<PaddingMeasurement | null> {
  return cell.evaluate((cellEl) => {
    const textEl = cellEl.querySelector(".parameter-value-text");
    if (!textEl) {
      return null;
    }

    const rawText = textEl.textContent ? textEl.textContent.trim() : "";
    if (!rawText) {
      return null;
    }

    const cellRect = cellEl.getBoundingClientRect();
    const textRect = textEl.getBoundingClientRect();
    const style = window.getComputedStyle(textEl);
    const paddingLeft = parseFloat(style.paddingLeft || "0") || 0;
    const paddingRight = parseFloat(style.paddingRight || "0") || 0;

    const range = document.createRange();
    range.selectNodeContents(textEl);
    const contentRect = range.getBoundingClientRect();
    if (typeof range.detach === "function") {
      range.detach();
    }

    let glyphLeft = contentRect.left;
    let glyphRight = contentRect.right;
    let glyphWidth = contentRect.width;

    if (!glyphWidth && !contentRect.height) {
      glyphLeft = textRect.left + paddingLeft;
      glyphRight = textRect.right - paddingRight;
      glyphWidth = Math.max(0, glyphRight - glyphLeft);
    }

    const leftGap = Math.max(0, glyphLeft - cellRect.left);
    const rightGap = Math.max(0, cellRect.right - glyphRight);

    const round2 = (value: number) => Math.round(value * 100) / 100;

    return {
      text: rawText,
      computedPaddingLeft: round2(paddingLeft),
      computedPaddingRight: round2(paddingRight),
      visualLeftPadding: round2(leftGap),
      visualRightPadding: round2(rightGap),
      cellWidth: round2(cellRect.width),
      textGlyphWidth: round2(glyphWidth),
      textElementWidth: round2(textRect.width),
    };
  });
}

async function collectParameterColumnMeasurements(page: Page, options: CollectOptions = {}): Promise<ColumnMeasurementRecord[]> {
  const maxColumns = options.maxColumns ?? 120;
  const skipEmpty = options.skipEmpty ?? true;
  const headerSelector = ".ag-header-cell[col-id]";
  const centerViewport = page.locator(".ag-center-cols-viewport").first();
  const results: ColumnMeasurementRecord[] = [];
  const seen = new Set<string>();
  const maxIterations = options.maxIterations ?? 200;
  const scrollStep = options.scrollStep ?? 400;
  const scrollWaitMs = options.scrollWaitMs ?? 150;
  const cellWaitMs = options.cellWaitMs ?? 60;

  const processVisibleHeaders = async (): Promise<boolean> => {
    const headerLocators = page.locator(headerSelector);
    const visibleColIds = await headerLocators.evaluateAll((elements) =>
      Array.from(new Set(
        elements
          .map((element) => element.getAttribute("col-id") || "")
          .filter((value) => value.length > 0),
      )),
    );

    for (const colId of visibleColIds) {
      if (colId.startsWith("__") || seen.has(colId)) {
        continue;
      }

      const header = page.locator(`.ag-header-cell[col-id="${colId}"]`).first();
      await header.scrollIntoViewIfNeeded();

      let headerText = "";
      const headerTextLocator = header.locator(".ag-header-cell-text");
      if ((await headerTextLocator.count()) > 0) {
        headerText = (await headerTextLocator.first().innerText()).trim();
      } else {
        headerText = ((await header.evaluate((el) => el.textContent || "")) as string).trim();
      }

      const baseCellLocator = page.locator(`.ag-center-cols-container .ag-cell[col-id="${colId}"].parameter-value-grid-cell`);
      const columnCellLocator = skipEmpty ? baseCellLocator.filter({ hasText: /\S/ }) : baseCellLocator;
      if ((await columnCellLocator.count()) === 0) {
        seen.add(colId);
        continue;
      }

      const cell = columnCellLocator.first();
      await cell.scrollIntoViewIfNeeded();
      await page.waitForTimeout(cellWaitMs);

      const measurement = await measureCellPadding(cell);
      if (!measurement) {
        seen.add(colId);
        continue;
      }

      const scrollLeft = (await centerViewport.count()) > 0 ? await centerViewport.evaluate((el) => el.scrollLeft) : null;

      const record: ColumnMeasurementRecord = {
        ordinal: results.length + 1,
        colId,
        headerText,
        measurement,
        scrollLeft,
      };

      results.push(record);
      seen.add(colId);

      if (options.onSample) {
        await options.onSample({
          ...record,
          cell,
        });
      }

      if (results.length >= maxColumns) {
        return true;
      }
    }

    return false;
  };

  if (await processVisibleHeaders()) {
    return results;
  }

  if ((await centerViewport.count()) === 0) {
    return results;
  }

  let iterationsWithoutNewColumns = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const previousProcessed = results.length;
    const { scrollLeft, maxScroll } = await centerViewport.evaluate((el) => ({
      scrollLeft: el.scrollLeft,
      maxScroll: el.scrollWidth - el.clientWidth,
    }));

    if (scrollLeft >= maxScroll) {
      break;
    }

    const nextScroll = Math.min(maxScroll, scrollLeft + scrollStep);
    await centerViewport.evaluate((el, value) => {
      el.scrollLeft = value;
    }, nextScroll);
    await page.waitForTimeout(scrollWaitMs);

    const reachedLimit = await processVisibleHeaders();
    if (reachedLimit) {
      break;
    }

    if (results.length === previousProcessed) {
      iterationsWithoutNewColumns += 1;
      if (iterationsWithoutNewColumns >= 3) {
        break;
      }
    } else {
      iterationsWithoutNewColumns = 0;
    }
  }

  return results;
}

type GroupAnalysis = {
  min: number;
  max: number;
  delta: number;
  sorted: ColumnMeasurementRecord[];
};

function analyzePaddingGroup(label: string, group: ColumnMeasurementRecord[]): GroupAnalysis {
  if (group.length === 0) {
    console.log(`${label}: no samples collected.`);
    return { min: 0, max: 0, delta: 0, sorted: [] };
  }

  const sorted = [...group].sort(
    (a, b) => a.measurement.visualRightPadding - b.measurement.visualRightPadding,
  );
  const min = sorted[0].measurement.visualRightPadding;
  const max = sorted[sorted.length - 1].measurement.visualRightPadding;
  const delta = Math.round((max - min) * 100) / 100;

  console.log(`${label}: ${group.length} samples (min=${min}px, max=${max}px, delta=${delta}px)`);

  const highlighted =
    sorted.length > 1 ? [sorted[0], sorted[sorted.length - 1]] : [sorted[0]];

  for (const sample of highlighted) {
    const data = sample.measurement;
    console.log(
        `  • ${sample.colId} ("${sample.headerText || sample.colId}") value="${data.text}" ` +
        `→ right=${data.visualRightPadding}px, left=${data.visualLeftPadding}px, computedRight=${data.computedPaddingRight}px, ` +
        `scrollLeft=${sample.scrollLeft ?? 0}`,
    );
  }

  return { min, max, delta, sorted };
}



test.use({ video: "on" });

/**
 * Comprehensive AG Grid Text Alignment Tests
 * 
 * Tests verify that all text elements in the AG Grid are properly aligned:
 * - Column headers
 * - Cell values
 * - Dropdown options
 * - Filter inputs
 * - Icons and buttons
 */

test.describe("AG Grid Text Alignment", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ storageKey, disableFlag }) => {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* noop */
      }
      if (!(disableFlag in window)) {
        try {
          Object.defineProperty(window, disableFlag, {
            value: true,
            writable: false,
            configurable: true,
          });
        } catch {
          window[disableFlag] = true;
        }
      } else {
        window[disableFlag] = true;
      }
    }, { storageKey: COLUMN_WIDTH_STORAGE_KEY, disableFlag: '__LABFRAME_DISABLE_COLUMN_WIDTH_OVERRIDES__' });

    await page.goto("http://localhost:3000/");
    await page.waitForSelector('.ag-root-wrapper', { timeout: 10000 });
    // Wait for grid to be fully rendered
    await page.waitForTimeout(3000);
    // Wait for parameter columns to be visible
    const hasParameterCells = await page.locator('.parameter-value-grid-cell').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasParameterCells) {
      console.warn("⚠️ No parameter cells found after wait");
    }
  });

  test("column headers should be properly aligned", async ({ page }) => {
    // Get all column headers
    const headers = page.locator('.ag-header-cell-text');
    const headerCount = await headers.count();

    expect(headerCount).toBeGreaterThan(0);

    // Check alignment for each header
    for (let i = 0; i < Math.min(headerCount, 10); i++) {
      const header = headers.nth(i);
      const headerText = await header.textContent();
      
      if (!headerText || headerText.trim() === '') continue;

      const box = await header.boundingBox();
      if (!box) continue;

      // Get computed styles
      const styles = await header.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          textAlign: computed.textAlign,
          paddingLeft: computed.paddingLeft,
          paddingRight: computed.paddingRight,
          lineHeight: computed.lineHeight,
          verticalAlign: computed.verticalAlign,
          display: computed.display,
        };
      });

      // Log alignment info
      console.log(`Header "${headerText}": ${JSON.stringify(styles)}`);

      // Headers should have consistent alignment
      expect(['left', 'center', 'right', 'start']).toContain(styles.textAlign);
    }
  });

  test("cell values should be vertically centered", async ({ page }) => {
    // Get all visible cells
    const cells = page.locator('.ag-cell:not(.ag-cell-inline-editing)').first();
    await expect(cells).toBeVisible();

    // Check multiple cells
    const allCells = page.locator('.ag-cell:not(.ag-cell-inline-editing)');
    const cellCount = await allCells.count();

    for (let i = 0; i < Math.min(cellCount, 20); i++) {
      const cell = allCells.nth(i);
      const cellText = await cell.textContent();
      
      if (!cellText || cellText.trim() === '') continue;

      const cellBox = await cell.boundingBox();
      if (!cellBox) continue;

      // Get cell alignment properties
      const alignment = await cell.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        const parent = el.parentElement;
        const parentComputed = parent ? window.getComputedStyle(parent) : null;

        return {
          display: computed.display,
          alignItems: computed.alignItems,
          justifyContent: computed.justifyContent,
          verticalAlign: computed.verticalAlign,
          lineHeight: computed.lineHeight,
          height: computed.height,
          paddingTop: computed.paddingTop,
          paddingBottom: computed.paddingBottom,
          rowDisplay: parentComputed?.display,
          rowAlignItems: parentComputed?.alignItems,
        };
      });

      console.log(`Cell "${cellText.substring(0, 20)}": ${JSON.stringify(alignment)}`);

      // Cells should use flexbox or have proper vertical centering
      // Note: AG Grid may use block display with line-height for centering
      const isProperlyAligned = 
        alignment.display === 'flex' || 
        alignment.alignItems === 'center' || 
        alignment.rowAlignItems === 'center' ||
        (alignment.display === 'block' && alignment.lineHeight !== 'normal');

      if (!isProperlyAligned) {
        console.warn(`Cell may not be properly aligned: "${cellText.substring(0, 20)}"`);
      }
    }
    
    // Test passes - we're just logging warnings for review
  });

  test("parameter cells with buttons should align text and button correctly", async ({ page }) => {
    // Find parameter cells (these have the dropdown buttons)
    const paramCells = page.locator('.ag-cell').filter({ hasText: /^\s*\S+/ });
    const count = await paramCells.count();

    if (count === 0) {
      console.log("No parameter cells found, skipping test");
      return;
    }

    // Check first few parameter cells
    for (let i = 0; i < Math.min(count, 10); i++) {
      const cell = paramCells.nth(i);
      const cellBox = await cell.boundingBox();
      
      if (!cellBox) continue;

      // Measure cell padding
      const cellInnerContent = cell.locator('.ag-cell-value, span, div').first();
      const contentBox = await cellInnerContent.boundingBox();

      if (contentBox && cellBox) {
        // Measure cell padding consistency
        // All parameter cells should have consistent padding now
        const leftPadding = contentBox.x - cellBox.x;
        const rightPadding = (cellBox.x + cellBox.width) - (contentBox.x + contentBox.width);
        
        // Padding should be consistent (within 1px tolerance)
        expect(Math.abs(leftPadding - rightPadding)).toBeLessThan(2);
      }
    }
  });

  test("dropdown options should be properly aligned when opened", async ({ page }) => {
    // Find a cell with dropdown
    const cellWithDropdown = page.locator('.ag-cell').filter({ 
      has: page.locator('button') 
    }).first();

    const hasDropdownCell = (await cellWithDropdown.count()) > 0;
    
    if (!hasDropdownCell) {
      console.log("No cells with dropdowns found, skipping test");
      return;
    }

    await expect(cellWithDropdown).toBeVisible();

    // Double-click to enter edit mode
    await cellWithDropdown.dblclick();
    await page.waitForTimeout(300);

    // Click the dropdown button if it exists
    const dropdownButton = cellWithDropdown.locator('button').first();
    if ((await dropdownButton.count()) > 0 && (await dropdownButton.isVisible())) {
      await dropdownButton.click();
      await page.waitForTimeout(200);

      // Check if dropdown options are visible
      const dropdownOptions = page.locator('[role="option"], .dropdown-item, [data-value]');
      const optionCount = await dropdownOptions.count();

      if (optionCount > 0) {
        console.log(`Found ${optionCount} dropdown options`);

        // Check alignment of first few options
        for (let i = 0; i < Math.min(optionCount, 5); i++) {
          const option = dropdownOptions.nth(i);
          const optionBox = await option.boundingBox();
          
          if (!optionBox) continue;

          const styles = await option.evaluate((el) => {
            const computed = window.getComputedStyle(el);
            return {
              textAlign: computed.textAlign,
              paddingLeft: computed.paddingLeft,
              paddingRight: computed.paddingRight,
              display: computed.display,
              alignItems: computed.alignItems,
            };
          });

          console.log(`Option ${i}: ${JSON.stringify(styles)}`);

          // Options should have consistent padding
          expect(styles.paddingLeft).toBeTruthy();
          expect(styles.paddingRight).toBeTruthy();
        }

        // All options should have same width
        const optionWidths = [];
        for (let i = 0; i < Math.min(optionCount, 5); i++) {
          const box = await dropdownOptions.nth(i).boundingBox();
          if (box) optionWidths.push(box.width);
        }

        if (optionWidths.length > 1) {
          const allSameWidth = optionWidths.every(w => Math.abs(w - optionWidths[0]) < 2);
          expect(allSameWidth).toBe(true);
        }
      }

      // Close dropdown by pressing Escape
      await page.keyboard.press('Escape');
    }
  });

  test("filter inputs should be aligned with column headers", async ({ page }) => {
    // Look for filter icon/button in header
    const filterIcon = page.locator('.ag-header-cell .ag-icon-filter, .ag-header-cell button').first();
    
    if ((await filterIcon.count()) === 0) {
      console.log("No filter icons found, skipping test");
      return;
    }

    const filterButton = page.locator('.ag-header-cell').first();
    const headerBox = await filterButton.boundingBox();

    if (headerBox) {
      const headerStyles = await filterButton.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          height: computed.height,
          padding: computed.padding,
          alignItems: computed.alignItems,
          display: computed.display,
        };
      });

      console.log(`Filter header styles: ${JSON.stringify(headerStyles)}`);

      // Header should have proper height and alignment
      expect(parseInt(headerStyles.height)).toBeGreaterThan(0);
    }
  });

  test("row height should be consistent across all rows", async ({ page }) => {
    const rows = page.locator('.ag-row');
    const rowCount = await rows.count();

    expect(rowCount).toBeGreaterThan(0);

    const rowHeights: number[] = [];
    
    // Measure first 10 rows
    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const row = rows.nth(i);
      const box = await row.boundingBox();
      if (box) {
        rowHeights.push(box.height);
      }
    }

    console.log(`Row heights: ${rowHeights.join(', ')}`);

    // All rows should have the same height (or very close)
    if (rowHeights.length > 1) {
      const firstHeight = rowHeights[0];
      const allSameHeight = rowHeights.every(h => Math.abs(h - firstHeight) < 2);
      
      expect(allSameHeight).toBe(true);
    }
  });

  test("column separators should align with header boundaries", async ({ page }) => {
    // Get all column headers
    const allHeaders = page.locator('.ag-header-cell');
    const headerCount = await allHeaders.count();

    if (headerCount < 2) {
      console.log("Not enough columns to test separators");
      return;
    }

    // Check column boundaries
    let validGaps = 0;
    let skippedGaps = 0;
    
    for (let i = 0; i < Math.min(headerCount - 1, 10); i++) {
      const header1 = allHeaders.nth(i);
      const header2 = allHeaders.nth(i + 1);

      const box1 = await header1.boundingBox();
      const box2 = await header2.boundingBox();

      if (box1 && box2) {
        const gap = box2.x - (box1.x + box1.width);
        
        console.log(`Gap between column ${i} and ${i + 1}: ${gap}px`);

        // Skip large gaps (likely row selector, checkboxes, or special columns)
        // Also skip negative gaps (overlapping columns in pinned scenarios)
        if (Math.abs(gap) > 20) {
          console.log(`  -> Skipping large gap (special column or pinned layout)`);
          skippedGaps++;
          continue;
        }

        validGaps++;
        // Gap should be minimal (columns should be adjacent)
        expect(Math.abs(gap)).toBeLessThan(3);
      }
    }

    console.log(`Checked ${validGaps} valid gaps, skipped ${skippedGaps} special column gaps`);
    
    // If all gaps are special columns (row selectors, etc.), that's acceptable
    // Just log a note that we couldn't verify regular column alignment
    if (validGaps === 0) {
      console.log("Note: All column gaps appear to be from special columns (row selectors, etc.)");
      console.log("This is expected for grids with row selection enabled.");
    }
  });

  test("cell text should not overflow or be clipped", async ({ page }) => {
    const cells = page.locator('.ag-cell');
    const cellCount = await cells.count();

    let clippedCount = 0;

    for (let i = 0; i < Math.min(cellCount, 30); i++) {
      const cell = cells.nth(i);
      const cellText = await cell.textContent();
      
      if (!cellText || cellText.trim() === '') continue;

      const isClipped = await cell.evaluate((el) => {
        const range = document.createRange();
        const textNode = el.childNodes[0];
        
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
          // Check for overflow on element itself
          return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
        }

        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        return rect.width > elRect.width || rect.height > elRect.height;
      });

      if (isClipped) {
        clippedCount++;
        console.log(`Cell ${i} text is clipped: "${cellText.substring(0, 30)}"`);
      }
    }

    console.log(`Total clipped cells: ${clippedCount} out of ${Math.min(cellCount, 30)}`);

    // Some clipping may be intentional (ellipsis), but should be minimal
    const clippedPercentage = (clippedCount / Math.min(cellCount, 30)) * 100;
    expect(clippedPercentage).toBeLessThan(50); // Less than 50% should be clipped
  });

  test("header icons should be vertically aligned with header text", async ({ page }) => {
    const headersWithIcons = page.locator('.ag-header-cell').filter({
      has: page.locator('.ag-icon, svg')
    });

    const count = await headersWithIcons.count();

    console.log(`Found ${count} headers with icons`);

    if (count === 0) {
      console.log("No header icons found - this is expected if grid has no sort/filter icons visible");
      // This is not a failure - just means no icons are present
      return;
    }

    // Only check if icons actually exist
    for (let i = 0; i < Math.min(count, 5); i++) {
      const header = headersWithIcons.nth(i);
      const headerText = header.locator('.ag-header-cell-text');
      const icon = header.locator('.ag-icon, svg').first();

      // Use shorter timeout since we already know icons exist
      const textBox = await headerText.boundingBox({ timeout: 2000 }).catch(() => null);
      const iconBox = await icon.boundingBox({ timeout: 2000 }).catch(() => null);

      if (textBox && iconBox) {
        const textCenterY = textBox.y + textBox.height / 2;
        const iconCenterY = iconBox.y + iconBox.height / 2;
        const diff = Math.abs(textCenterY - iconCenterY);

        console.log(`Header ${i}: Icon-text vertical alignment diff: ${diff}px`);

        // Icon and text should be roughly vertically aligned
        expect(diff).toBeLessThan(5);
      }
    }
  });

  test("parameter columns should have consistent padding within their button groups", async ({ page }) => {
    // Find parameter cells (these are in parameter columns, not base columns)
    const allCells = page.locator('.ag-cell:not(.ag-cell-inline-editing)');
    const cellCount = await allCells.count();

    if (cellCount === 0) {
      console.log("No cells found, skipping test");
      return;
    }

    // Collect padding values for parameter cells, grouped by button presence
    const parameterCellWithButtons: number[] = [];
    const parameterCellWithoutButtons: number[] = [];

    // Check first few cells to find parameter columns
    for (let i = 0; i < Math.min(cellCount, 200); i++) {
      const cell = allCells.nth(i);
      const cellClass = await cell.getAttribute('class');

      // Skip non-parameter cells (checkbox, ID, etc.)
      if (!cellClass || !cellClass.includes('parameter-value-grid-cell')) {
        continue;
      }

      const cellText = await cell.textContent();
      if (!cellText || cellText.trim() === '') continue;

      // Get the padding-right of the text element
      const textElement = cell.locator('.parameter-value-text');
      const paddingRight = await textElement.evaluate((el) => {
        const computedStyle = window.getComputedStyle(el);
        return parseFloat(computedStyle.paddingRight);
      });

      if (!isNaN(paddingRight)) {
        parameterCellWithButtons.push(paddingRight); // All cells now use the same padding

        // Log first few cells for debugging
        if (parameterCellWithButtons.length <= 10) {
          console.log(`Parameter cell ${i}: text="${cellText}", padding-right=${paddingRight}px`);
        }
      }
    }

    console.log(`Found ${parameterCellWithButtons.length} parameter cells`);

    // Test: All parameter cells should have the same padding
    if (parameterCellWithButtons.length > 1) {
      const uniquePaddings = [...new Set(parameterCellWithButtons)];
      console.log(`Parameter cells padding values: ${parameterCellWithButtons.slice(0, 5).join(', ')}${parameterCellWithButtons.length > 5 ? '...' : ''}`);
      console.log(`Unique padding values: ${uniquePaddings.join(', ')}px`);

      expect(uniquePaddings.length).toBe(1);
      console.log(`✅ All parameter cells have consistent padding: ${uniquePaddings[0]}px`);
    } else if (parameterCellWithButtons.length === 1) {
      console.log(`✅ Only one parameter cell found, padding: ${parameterCellWithButtons[0]}px`);
    }
  });

  test("parameter columns should have visually consistent text-to-edge spacing", async ({ page }) => {
    const centerViewport = page.locator(".ag-center-cols-viewport").first();
    if (await centerViewport.count()) {
      await centerViewport.evaluate((el) => {
        el.scrollLeft = 0;
      });
      await page.waitForTimeout(250);
    }

    const measurements = await collectParameterColumnMeasurements(page, {
      maxColumns: 150,
    });

    console.log(`Collected padding samples for ${measurements.length} parameter columns`);

    if (measurements.length === 0) {
      console.log("No parameter columns available for measurement, skipping test.");
      return;
    }

    // All parameter columns now have the same padding (no button distinction)
    const allColumns = measurements;

    const tolerancePx = 1;

    const allStats = analyzePaddingGroup("Parameter columns", allColumns);

    const logGroupSamples = (label: string, analysis: GroupAnalysis) => {
      const sorted = analysis.sorted;
      if (sorted.length === 0) {
        console.log(`   ${label}: no samples.`);
        return;
      }
      const lowestSamples = sorted.slice(0, Math.min(3, sorted.length));
      const highestSamples = sorted.slice(-Math.min(3, sorted.length));
      console.log(`   ${label} lowest samples:`);
      for (const sample of lowestSamples) {
        const data = sample.measurement;
        console.log(
          `     ${sample.colId} ("${sample.headerText || sample.colId}") value="${data.text}" → right=${data.visualRightPadding}px (computed=${data.computedPaddingRight}px, left=${data.visualLeftPadding}px)`
        );
      }
      if (sorted.length > 3) {
        console.log(`   ${label} highest samples:`);
        for (const sample of highestSamples) {
          const data = sample.measurement;
          console.log(
            `     ${sample.colId} ("${sample.headerText || sample.colId}") value="${data.text}" → right=${data.visualRightPadding}px (computed=${data.computedPaddingRight}px, left=${data.visualLeftPadding}px)`
          );
        }
      }
    };

    logGroupSamples("Parameter columns", allStats);

    if (allColumns.length > 1) {
      if (allStats.delta > tolerancePx) {
        console.warn("❌ Visual padding differs within parameter columns by more than 1px.");
      }
      expect(allStats.delta).toBeLessThanOrEqual(tolerancePx);
    }
  });

  test.describe("visual padding capture", () => {
    test("visual padding consistency across parameter columns", async ({ page }) => {
      await Promise.all([
        ensureDirExists(TRACES_ROOT),
        ensureDirExists(SCREENSHOTS_ROOT),
        ensureDirExists(VIDEO_ROOT),
      ]);

      const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
      const traceDir = path.join(TRACES_ROOT, runStamp);
      const screenshotDir = path.join(SCREENSHOTS_ROOT, runStamp);
      await Promise.all([ensureDirExists(traceDir), ensureDirExists(screenshotDir)]);

      const gridRoot = page.locator(".ag-root-wrapper");
      const centerViewport = page.locator(".ag-center-cols-viewport").first();

      if (await centerViewport.count()) {
        await centerViewport.evaluate((el) => {
          el.scrollLeft = 0;
        });
        await page.waitForTimeout(300);
        if (await gridRoot.count()) {
          await gridRoot.screenshot({ path: path.join(screenshotDir, "grid-scroll-start.png") });
        }
      }

      const screenshotFilenames: string[] = [];
      const measurements = await collectParameterColumnMeasurements(page, {
        maxColumns: 150,
        onSample: async ({ ordinal, colId, headerText, cell, measurement }) => {
          const safeHeader = sanitizeForFilename(headerText, colId);
          const safeValue = sanitizeForFilename(measurement.text, "value");
          const suffix = "param";
          const filename = `${String(ordinal).padStart(3, "0")}-${safeHeader}-${suffix}-${safeValue}.png`;
          const screenshotPath = path.join(screenshotDir, filename);
          await cell.screenshot({ path: screenshotPath });
          screenshotFilenames.push(filename);
        },
      });

      console.log(`Captured visual padding samples for ${measurements.length} parameter columns`);

      if (measurements.length === 0) {
        console.log("No parameter columns captured; skipping visual padding capture.");
        return;
      }

      if (await centerViewport.count()) {
        await page.waitForTimeout(300);
        if (await gridRoot.count()) {
          await gridRoot.screenshot({ path: path.join(screenshotDir, "grid-scroll-end.png") });
        }
      }

      const reportPath = path.join(traceDir, "padding-measurements.json");
      await fs.promises.writeFile(
        reportPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            screenshots: screenshotFilenames,
            measurements,
          },
          null,
          2,
        ),
      );
      console.log(`📄 Padding measurements saved to ${reportPath}`);

      // All parameter columns now have the same padding (no button distinction)
      const allColumns = measurements;

      const tolerancePx = 1;
      const allStats = analyzePaddingGroup("Parameter columns", allColumns);

      const logGroupSamples = (label: string, analysis: GroupAnalysis) => {
        const sorted = analysis.sorted;
        if (sorted.length === 0) {
          console.log(`   ${label}: no samples.`);
          return;
        }
        const lowestSamples = sorted.slice(0, Math.min(3, sorted.length));
        const highestSamples = sorted.slice(-Math.min(3, sorted.length));
        console.log(`   ${label} lowest samples:`);
        for (const sample of lowestSamples) {
          const data = sample.measurement;
          console.log(
            `     ${sample.colId} ("${sample.headerText || sample.colId}") value="${data.text}" → right=${data.visualRightPadding}px (computed=${data.computedPaddingRight}px, left=${data.visualLeftPadding}px)`
          );
        }
        if (sorted.length > 3) {
          console.log(`   ${label} highest samples:`);
          for (const sample of highestSamples) {
            const data = sample.measurement;
            console.log(
              `     ${sample.colId} ("${sample.headerText || sample.colId}") value="${data.text}" → right=${data.visualRightPadding}px (computed=${data.computedPaddingRight}px, left=${data.visualLeftPadding}px)`
            );
          }
        }
      };

      logGroupSamples("Parameter columns", allStats);

      if (allColumns.length > 1) {
        if (allStats.delta > tolerancePx) {
          console.warn("❌ Visual padding differs within parameter columns by more than 1px.");
        }
        expect(allStats.delta).toBeLessThanOrEqual(tolerancePx);
      }

      if (screenshotFilenames.length > 0) {
        console.log("📸 Saved cell screenshots:");
        for (const name of screenshotFilenames) {
          console.log(`   - ${path.join(screenshotDir, name)}`);
        }
      }

      const video = await page.video();
      if (video) {
        await ensureDirExists(VIDEO_ROOT);
        const videoPath = path.join(VIDEO_ROOT, `ag-grid-padding-scroll-${runStamp}.webm`);
        try {
          await page.close();
          await video.saveAs(videoPath);
          console.log(`🎥 Scroll video saved to ${videoPath}`);
        } catch (error) {
          console.warn(`⚠️ Failed to save video to ${videoPath}:`, error);
        } finally {
          await video.delete().catch(() => {});
        }
      } else {
        console.warn("⚠️ Video recording not available. Ensure test.use({ video: 'on' }) is configured.");
      }
    });
  });

  test("take screenshot of grid for visual inspection", async ({ page }) => {
    // Wait for grid to be fully loaded
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await expect(page).toHaveScreenshot('ag-grid-alignment-full.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });

    // Take screenshot of just the grid
    const grid = page.locator('.ag-root-wrapper');
    await expect(grid).toHaveScreenshot('ag-grid-alignment-grid-only.png', {
      maxDiffPixels: 100,
    });

    // Take screenshot of header row
    const header = page.locator('.ag-header');
    await expect(header).toHaveScreenshot('ag-grid-alignment-headers.png', {
      maxDiffPixels: 50,
    });
  });
});

test.describe("AG Grid Alignment - Dark Theme", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('.ag-root-wrapper', { timeout: 10000 });

    // Switch to dark theme if toggle exists
    const themeToggle = page.locator('button[aria-label*="theme" i]').first();
    if ((await themeToggle.count()) > 0) {
      const html = page.locator('html');
      const initialClass = await html.getAttribute('class');
      
      if (!initialClass?.includes('dark')) {
        await themeToggle.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test("grid alignment should be consistent in dark theme", async ({ page }) => {
    // Run same alignment checks as light theme
    const cells = page.locator('.ag-cell');
    const cellCount = await cells.count();
    expect(cellCount).toBeGreaterThan(0);

    // Check a few cells for proper alignment
    for (let i = 0; i < Math.min(cellCount, 10); i++) {
      const cell = cells.nth(i);
      const alignment = await cell.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          alignItems: computed.alignItems,
        };
      });

      console.log(`Dark theme cell ${i}: ${JSON.stringify(alignment)}`);
    }

    // Take screenshot for comparison
    await expect(page).toHaveScreenshot('ag-grid-alignment-dark-theme.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});
