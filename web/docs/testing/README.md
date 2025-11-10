# UI Testing Guide

Comprehensive testing documentation for the LabFrame UI.
All test types, commands, and best practices in one place.

## 📋 Quick Start

```bash
# Run all tests
npm run test:all

# Development workflow
npm test                 # Component tests (watch mode)
npm run test:e2e:ui      # E2E tests (interactive)
npm run lint             # Linting

# Coverage
npm run test:coverage    # Generate coverage report
```

## 🎯 Test Types

### 1. Static Checks
Catches obvious issues before runtime.

```bash
npm run lint             # ESLint
npm run build            # TypeScript strict mode check
```

### 2. Component Tests (Vitest + React Testing Library)
Unit and integration tests for UI components, located in `**/*.test.tsx` files.

**Commands:**
```bash
npm test                 # Watch mode for TDD
npm run test:run         # Single run (CI)
npm run test:coverage    # With coverage report
npm run test:ui          # Visual UI mode
```

**What to test:**
- Component rendering with different props/states
- User interactions (clicks, typing, form submissions)
- Hook behavior with mocked API responses
- Utility functions and helpers
- Accessibility (ARIA attributes, keyboard nav)

**Example:**
```tsx
import { render, screen, userEvent } from '@/tests/utils';
import { Button } from './button';

describe('Button', () => {
  it('handles click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    
    render(<Button onClick={onClick}>Click me</Button>);
    await user.click(screen.getByRole('button'));
    
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

### 3. Integration Tests (Vitest + MSW)
Test component interactions with mocked API responses.

**Features:**
- MSW (Mock Service Worker) intercepts network requests
- React Query integration for data fetching
- Fake timers for debouncing/throttling
- Error scenario testing

**Example:**
```tsx
import { server } from '@/tests/mocks/server';
import { http, HttpResponse } from 'msw';

test('handles API error', async () => {
  server.use(
    http.get('/api/samples', () => 
      HttpResponse.json({ error: 'Failed' }, { status: 500 })
    )
  );
  
  render(<SamplesPage />);
  await screen.findByText(/error/i);
});
```

### 4. End-to-End Tests (Playwright)
Complete user flows in real browsers, located in `e2e/` directory.

**Commands:**
```bash
npm run test:e2e         # Headless (all browsers)
npm run test:e2e:ui      # Interactive UI mode ⭐
npm run test:e2e:debug   # Debug mode with pauses
```

**Browser Coverage:**
- ✅ Chrome (light theme)
- ✅ Chrome (dark theme)
- ✅ Firefox
- ✅ Safari (WebKit)
- ✅ Mobile Chrome
- ✅ Mobile Safari

**What to test:**
- Complete user journeys (filter → edit → save)
- Multi-step operations
- Error handling and recovery
- Theme switching
- Responsive layouts
- Real browser behavior

**Example:**
```typescript
import { test, expect } from './fixtures';

test('complete sample workflow', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role="grid"]');
  
  // Filter samples
  await page.fill('input[placeholder*="Search"]', 'SAM-001');
  await expect(page.locator('.ag-row')).toHaveCount(1);
  
  // Edit sample
  await page.click('.ag-cell[col-id="code"]');
  await page.keyboard.type('-EDITED');
  await page.keyboard.press('Enter');
  
  await expect(page.locator('text="SAM-001-EDITED"')).toBeVisible();
});
```

### 5. Visual Regression (Playwright Screenshots)
Automated screenshot comparison to detect visual changes.

**Features:**
- Pixel-by-pixel screenshot diffing
- Light/dark theme coverage
- Responsive layout verification
- AG Grid layout consistency

**Example:**
```typescript
test('samples page layout', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role="grid"]');
  
  await expect(page).toHaveScreenshot('samples-page.png', {
    maxDiffPixels: 100
  });
});
```

### 6. Accessibility Testing
WCAG 2.1 AA compliance checks using axe-core.

**Component tests:**
```tsx
import { axe, toHaveNoViolations } from 'vitest-axe';
expect.extend(toHaveNoViolations);

test('is accessible', async () => {
  const { container } = render(<Component />);
  expect(await axe(container)).toHaveNoViolations();
});
```

**E2E tests:**
```typescript
import { checkPageAccessibility } from './fixtures';

test('page is accessible', async ({ page }) => {
  await page.goto('/');
  await checkPageAccessibility(page);
});
```

## 📦 Test Data & Fixtures

### Factories
Located in `tests/helpers/fixtures/`:
- `samples.ts` - Sample data factories
- `parameters.ts` - Parameter definition factories

**Usage:**
```typescript
import { createMockSample, createMockSamples } from '@/tests/helpers/fixtures/samples';

const sample = createMockSample({ code: 'SAM-001' });
const samples = createMockSamples(10); // Generate 10 samples
```

### MSW API Mocks
Located in `tests/helpers/mocks/`:
- `handlers.ts` - Default API mock handlers
- `server.ts` - MSW server setup

**Override in tests:**
```typescript
import { server } from '@/tests/helpers/mocks/server';
import { http, HttpResponse } from 'msw';

server.use(
  http.get('/api/samples', () => {
    return HttpResponse.json(customData);
  })
);
```

## 🏗️ File Structure

```
ui/web/
├── tests/                         # All test-related files
│   ├── e2e/                      # Playwright E2E tests
│   │   ├── fixtures.ts
│   │   ├── samples.spec.ts
│   │   ├── accessibility.spec.ts
│   │   └── ag-grid-alignment.spec.ts
│   ├── integration/              # Integration tests
│   │   └── samples-api.test.tsx
│   ├── component/                # Component tests (empty, ready)
│   ├── unit/                     # Unit tests (empty, ready)
│   ├── helpers/                  # Test utilities
│   │   ├── setup.ts
│   │   ├── utils.tsx
│   │   ├── fixtures/            # Test data factories
│   │   │   ├── samples.ts
│   │   │   └── parameters.ts
│   │   └── mocks/               # MSW mocks
│   │       ├── handlers.ts
│   │       └── server.ts
│   └── results/                  # Generated test artifacts
│       ├── coverage/
│       ├── playwright-report/
│       ├── test-results/
│       └── playwright-results.json
├── components/
│   └── ui/
│       ├── button.tsx
│       └── button.test.tsx       # Co-located tests
├── lib/
│   └── hooks/
│       ├── use-samples.ts
│       └── use-samples.test.tsx
├── config/                        # All movable configurations
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   ├── eslint.config.mjs
│   └── postcss.config.mjs
└── docs/testing/                  # This documentation
    ├── README.md                  # You are here
    ├── AG-GRID-TESTING.md         # AG Grid specific tests
    └── CI-SETUP.md                # CI/CD integration
```

## 🎓 Best Practices

### Component Tests
1. **Test user behavior, not implementation**
   - ❌ `expect(component.state.value).toBe(5)`
   - ✅ `expect(screen.getByText('5')).toBeInTheDocument()`

2. **Use semantic queries**
   - Prefer `getByRole`, `getByLabelText` over `getByTestId`
   - Makes tests resilient to DOM changes

3. **Mock external dependencies**
   - API calls via MSW
   - Router via `next/navigation` mocks
   - Browser APIs (matchMedia, IntersectionObserver)

4. **Keep tests fast**
   - Target <100ms per test
   - Use factories for test data
   - Avoid unnecessary `waitFor` calls

5. **Use descriptive test names**
   - ❌ `it('works')`
   - ✅ `it('shows error message when API fails')`

### E2E Tests
1. **Test critical user paths**
   - Focus on features that drive business value
   - Don't E2E test every component variant

2. **Use stable selectors**
   - Prefer roles, labels, test IDs
   - Avoid brittle CSS selectors

3. **Wait for content, not arbitrary timeouts**
   - ❌ `await page.waitForTimeout(3000)`
   - ✅ `await page.waitForSelector('[role="grid"]')`

4. **Handle flakiness**
   - Configure retries in CI (see `playwright.config.ts`)
   - Use auto-waiting built into Playwright

5. **Parallelize when possible**
   - Run tests independently
   - Seed database with known state per test

6. **Clean up after tests**
   - Reset database state
   - Clear browser storage

### Coverage Goals
- **Lines**: 70%+
- **Functions**: 70%+
- **Branches**: 70%+
- **Statements**: 70%+

Focus on critical paths rather than 100% coverage.

## 🚀 CI/CD Integration

### GitHub Actions
Workflow: `.github/workflows/ui-tests.yml`

**Jobs:**
1. **lint** - ESLint + TypeScript check
2. **unit-tests** - Vitest with coverage (uploaded to Codecov)
3. **e2e-tests** - Playwright across all 6 browser projects
4. **accessibility** - Dedicated a11y suite
5. **gate** - All jobs must pass

**Triggers:**
- Push to `main`/`develop`
- Pull requests
- Changes to `ui/` directory

**Artifacts:**
- Coverage reports
- Playwright HTML reports
- Test screenshots
- Accessibility results

## 🔧 Troubleshooting

### Tests hang or timeout
- Check for missing `await` in async tests
- Verify MSW handlers return responses
- Ensure test cleanup in `afterEach`
- Check console for unhandled promise rejections

### Flaky E2E tests
- Use proper wait strategies (not `waitForTimeout`)
- Increase timeout for slow CI: `test.setTimeout(60000)`
- Check for race conditions
- Verify database state is reset between tests

### Coverage not accurate
- Ensure source files are in `coverage.include`
- Check `vitest.config.ts` coverage settings
- Verify test files follow `*.test.tsx` naming

### Can't find module errors
- Run `npm ci` for fresh install
- Check path aliases in `tsconfig.json`
- Verify imports use `@/` prefix
- Ensure `vitest.config.ts` has matching aliases

### Playwright browser not found
- Run `npx playwright install`
- Check system dependencies (Linux): `npx playwright install-deps`

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [AG Grid Testing](https://www.ag-grid.com/react-data-grid/testing/)

## 📝 Related Documentation

- [AG Grid Alignment Testing](./AG-GRID-TESTING.md) - Specific guidance for grid alignment tests
- [CI/CD Setup](./CI-SETUP.md) - GitHub Actions workflow details
