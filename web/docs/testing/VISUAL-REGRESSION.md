# Visual Regression Testing

## Purpose

These tests verify that the UI is properly styled and functional, catching issues like:
- Missing CSS imports
- Broken PostCSS processing
- Config file misplacement
- Theme/styling failures

## Test File

`tests/e2e/visual-regression.spec.ts`

## Test Coverage

### Visual Regression & Styling Tests

1. **CSS Loading** - Verifies all stylesheets loaded
2. **AG Grid Styling** - Checks grid has proper styles and dimensions
3. **Custom Fonts** - Ensures custom fonts are applied
4. **Theme Colors** - Validates CSS custom properties
5. **Filter Bar** - Checks filter input styling
6. **Button Styling** - Verifies button appearance
7. **Layout Structure** - Ensures proper page layout
8. **Grid Headers** - Checks header formatting
9. **Smoke Test** - Verifies page has content (not blank)
10. **PostCSS Processing** - Validates Tailwind utilities work
11. **AG Grid Theme** - Checks AG Grid theme application

### CSS Import Integrity Tests

12. **Stylesheet Presence** - Verifies stylesheets in DOM
13. **No FOUC** - Checks for Flash of Unstyled Content
14. **Animation Utilities** - Validates tw-animate-css loaded

## Running Tests

```bash
# Run all visual regression tests
npm run test:e2e -- visual-regression.spec.ts

# Run specific browser
npm run test:e2e -- visual-regression.spec.ts --project=chromium-light

# Run with UI
npm run test:e2e:ui -- visual-regression.spec.ts
```

## Common Issues Caught

### Issue: Broken CSS (No Styling)

**Symptoms:**
- Grid appears but has no styling
- No colors, fonts, or theming
- UI looks like unstyled HTML

**Causes:**
- `postcss.config.mjs` moved from root directory
- Missing `tw-animate-css` package
- Broken CSS imports in `app/globals.css`

**Fix:**
- Keep `postcss.config.mjs` in project root
- Ensure all dependencies installed: `npm install`
- Verify CSS imports use correct paths

**Tests that catch this:**
- `should load all stylesheets and CSS`
- `should have AG Grid styles loaded`
- `should load and apply PostCSS processed styles`
- `should not have FOUC`

### Issue: Missing AG Grid Styles

**Symptoms:**
- Grid renders but looks broken
- No cell borders or proper spacing
- Headers not formatted

**Causes:**
- AG Grid CSS not imported
- Wrong theme class
- CSS processing failed

**Tests that catch this:**
- `should have AG Grid styles loaded`
- `should render AG Grid theme correctly`
- `should display grid headers with proper formatting`

### Issue: Theme Not Applied

**Symptoms:**
- Default browser colors instead of custom theme
- CSS variables undefined
- Inconsistent styling

**Causes:**
- Theme CSS not loaded
- Custom properties not defined
- PostCSS not processing `@theme` directive

**Tests that catch this:**
- `should have themed colors applied`
- `should apply custom font families`

## Critical: PostCSS Config Location

⚠️ **`postcss.config.mjs` MUST be in project root**

Next.js and PostCSS look for this file in the root by default. Moving it breaks CSS processing.

**Correct location:**
```
web/
├── postcss.config.mjs    ← HERE (root)
├── config/
│   ├── eslint.config.mjs
│   ├── vitest.config.ts
│   └── playwright.config.ts
└── ...
```

**Incorrect location:**
```
web/
├── config/
│   ├── postcss.config.mjs    ← WRONG!
│   └── ...
```

## CI Integration

These tests should run in CI to catch styling breaks early:

```yaml
- name: Run Visual Regression Tests
  run: npm run test:e2e -- visual-regression.spec.ts --project=chromium-light
```

## Test Philosophy

Visual regression tests are **smoke tests** for styling:
- Fast execution (1-2 minutes)
- Catch major breaks immediately
- Don't replace manual visual review
- Complement unit/integration tests

They verify that:
1. CSS pipeline works (PostCSS, Tailwind, imports)
2. Styles are applied (not just compiled)
3. Layout renders correctly
4. No blank/broken pages

## Adding New Tests

When adding UI features, consider adding visual regression tests for:
- New theme colors or CSS variables
- Custom styling that could break
- Critical layout components
- Animation/interaction effects

Example:

```typescript
test("should render my new component with proper styling", async ({ page }) => {
  await page.goto("/");
  
  const myComponent = page.locator('[data-testid="my-component"]');
  await expect(myComponent).toBeVisible();
  
  const styles = await myComponent.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      backgroundColor: computed.backgroundColor,
      padding: computed.padding,
    };
  });
  
  expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});
```

## Related Documentation

- [Testing Overview](./README.md)
- [AG Grid Testing](./AG-GRID-TESTING.md)
- [Config Philosophy](../CONFIG-PHILOSOPHY.md)
