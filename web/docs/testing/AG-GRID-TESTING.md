# AG Grid Alignment Testing

Comprehensive guide for testing AG Grid text alignment in the LabFrame UI.

## Overview

The AG Grid alignment tests verify that all text elements (headers, cells,
dropdown options) are properly aligned and visually consistent across themes
and viewports.

**Test Location:** `tests/e2e/ag-grid-alignment.spec.ts`

## Running Tests

### Prerequisites

**Terminal 1 - Start FastAPI Backend:**

You can run from any directory. Just ensure the virtual environment is activated:

```bash
source ~/Backend/python/venv/thesis/bin/activate
cd /Users/dubf/Developer/LabFrame/api
uvicorn labframe_api.app:app --reload --log-config logging.yaml
```

**Terminal 2 - Start Next.js Dev Server:**

```bash
cd ui/web
npm run dev
```

### Test Commands

```bash
# Interactive mode (recommended) - step through tests visually
npx playwright test ag-grid-alignment.spec.ts --ui

# Headed mode - see browser in real-time
npx playwright test ag-grid-alignment.spec.ts --headed --project=chromium-light

# Generate HTML report with screenshots
npx playwright test ag-grid-alignment.spec.ts --reporter=html
npx playwright show-report

# Run specific test
npx playwright test ag-grid-alignment.spec.ts -g "cell values should be vertically centered"

# Debug mode - pause at each step
npx playwright test ag-grid-alignment.spec.ts --debug
```

## Test Coverage

The alignment test suite (`e2e/ag-grid-alignment.spec.ts`) includes 11 tests:

### 1. Header Alignment

Verifies column headers are horizontally and vertically centered.

```typescript
test("column headers should be properly aligned", async ({ page }) => {
  // Checks header text positioning
  // Verifies consistent padding and alignment
});
```

### 2. Cell Vertical Centering

Checks that cell values are vertically centered within their rows.

**Note:** AG Grid may use `display: block` with `line-height` for centering
instead of flexbox. This is acceptable as long as visual alignment is correct.

```typescript
test("cell values should be vertically centered", async ({ page }) => {
  // Logs cell display properties
  // Accepts both flexbox and line-height centering
});
```

### 3. Parameter Button Alignment

Ensures dropdown buttons in parameter cells align properly with text.

```typescript
test("parameter cells with buttons should align text and button correctly");
```

### 4. Dropdown Option Alignment

Verifies dropdown menu options are consistently aligned and spaced.

```typescript
test("dropdown options should be properly aligned when opened");
```

### 5. Filter Input Alignment

Checks that filter inputs align with column headers.

```typescript
test("filter inputs should be aligned with column headers");
```

### 6. Row Height Consistency

Ensures all rows have uniform height.

```typescript
test("row height should be consistent across all rows", async ({ page }) => {
  // All rows should be 42px (or consistent value)
});
```

### 7. Column Separators

Verifies columns are adjacent without large gaps.

**Note:** Skips special columns (like row selectors) that may have intentional
spacing. The first column often has a ~60px offset for selection UI.

```typescript
test("column separators should align with header boundaries", async ({ page }) => {
  // Checks gaps between columns
  // Skips gaps >20px (special columns)
  // Regular columns should be <3px apart
});
```

### 8. Text Overflow

Checks that cell text doesn't overflow or get clipped.

```typescript
test("cell text should not overflow or be clipped");
```

### 9. Visual Screenshot

Captures a full-page screenshot for visual inspection.

```typescript
test("take screenshot of grid for visual inspection");
```

### 10. Dark Theme Consistency

Verifies alignment is consistent in dark theme.

```typescript
test("grid alignment should be consistent in dark theme");
```

### 11. Header Icons (Optional)

Checks header icon alignment when sort/filter icons are present.

**Note:** If your grid has no header icons, this test gracefully skips. The
test only fails if icons exist but are misaligned.

```typescript
test("header icons should be vertically aligned with header text", async ({ page }) => {
  // Skips if no icons found
  // Only checks alignment if icons exist
});
```

## Manual Verification Checklist

While automated tests catch most issues, manual inspection is valuable:

### Headers

- [ ] All column headers horizontally aligned
- [ ] Header text vertically centered in header cells
- [ ] Sort/filter icons align with header text (if present)
- [ ] No text overflow or clipping

### Cell Values

- [ ] All cell values vertically centered
- [ ] Text alignment consistent within columns
- [ ] Numbers align right (if applicable)
- [ ] Text aligns left (if applicable)

### Parameter Cells

- [ ] Dropdown button aligns to right edge
- [ ] Button vertically centered with text
- [ ] Consistent gap between text and button
- [ ] Button doesn't overlap text

### Dropdown Menus

- [ ] All options have same width
- [ ] Text left-aligned with consistent padding
- [ ] Options evenly spaced vertically
- [ ] Selected option clearly highlighted

### Layout

- [ ] All rows have consistent height
- [ ] No rows taller/shorter than others
- [ ] Column separators align with headers
- [ ] No gaps or overlaps between columns

### Themes

- [ ] Light theme: all elements properly aligned
- [ ] Dark theme: all elements properly aligned
- [ ] No alignment changes when switching themes

## Common Issues and Fixes

### Issue: Large Column Gap

**Symptom:** Test fails with "Expected: < 3, Received: 60" for column gap.

**Cause:** Row selector column or other special column with intentional
spacing.

**Fix:** The test now skips gaps >20px automatically. No action needed unless
gap appears between regular data columns.

### Issue: Header Icons Timeout

**Symptom:** Test times out waiting for `.ag-header-cell-text`.

**Cause:** No header icons are present in the grid.

**Fix:** The test now gracefully skips if no icons are found. This is
expected behavior.

### Issue: Cells Using Block Display

**Symptom:** Console logs show `display: "block"` instead of `"flex"`.

**Cause:** AG Grid uses line-height for vertical centering instead of flexbox.

**Fix:** This is acceptable. The test now accepts both flexbox and line-height
centering methods.

### Issue: Flaky Screenshot Comparison

**Symptom:** Screenshot diff shows minor pixel differences.

**Cause:** Font rendering differences, animation timing, or browser variance.

**Fix:**

- Increase `maxDiffPixels` threshold in test
- Ensure grid finishes loading before screenshot
- Use consistent browser/OS for baseline

## Debugging Failed Tests

### Step 1: Run in UI Mode

```bash
npx playwright test ag-grid-alignment.spec.ts --ui
```

This shows you exactly what the test sees and where it fails.

### Step 2: Check Console Logs

Tests log detailed alignment information:

```
Cell "25": {"display":"block","alignItems":"normal",...}
Gap between column 0 and 1: 60px
Header 0: {"textAlign":"start","paddingLeft":"0px",...}
```

### Step 3: Inspect Screenshots

Failed tests automatically save screenshots to `test-results/`:

```bash
open test-results/ag-grid-alignment-spec-ts-column-headers-should-be-properly-aligned-chromium-light/
```

### Step 4: Run in Debug Mode

```bash
npx playwright test ag-grid-alignment.spec.ts --debug
```

Pauses before each action so you can inspect the state.

## Best Practices

1. **Always run servers first** - Tests require both FastAPI and Next.js
running
2. **Use UI mode for development** - Easier to see what's happening
3. **Check console logs** - Tests log detailed alignment data
4. **Review screenshots** - Visual inspection catches subtle issues
5. **Test across themes** - Both light and dark themes should pass
6. **Update baselines carefully** - Only accept screenshot changes if
intentional

## CI/CD Integration

These tests run in the `e2e-tests` job of `.github/workflows/ui-tests.yml`:

```yaml
- name: Run E2E tests
  run: npm run test:e2e

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

Playwright HTML reports are uploaded as artifacts for failed builds.

## Resources

- [AG Grid Testing Guide](https://www.ag-grid.com/react-data-grid/testing/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Visual Comparison Testing](https://playwright.dev/docs/test-snapshots)
