# CI/CD Setup for UI Tests

GitHub Actions workflow configuration and troubleshooting for the LabFrame UI
test suite.

## Workflow Overview

File: `.github/workflows/ui-tests.yml`

The workflow runs on:

- Push to `main` or `develop` branches
- Pull requests to any branch
- Changes in `ui/web/**` directory

## Jobs

### 1. Lint

Runs ESLint and TypeScript checks.

```yaml
lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: 'npm'
        cache-dependency-path: ui/web/package-lock.json
    - run: npm ci
    - run: npm run lint
```

**What it checks:**

- ESLint rules compliance
- TypeScript type errors
- Code style consistency

### 2. Unit Tests

Runs Vitest component and integration tests with coverage.

```yaml
unit-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run test:coverage
    - uses: codecov/codecov-action@v4
      with:
        files: ./coverage/coverage-final.json
        flags: ui-tests
```

**What it does:**

- Runs all `*.test.tsx` files
- Generates coverage report (HTML + LCOV)
- Uploads coverage to Codecov
- Enforces 70% coverage threshold

**Artifacts:**

- `coverage/` - HTML coverage report (30 days)

### 3. E2E Tests

Runs Playwright tests across multiple browsers.

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx playwright install --with-deps
    - run: npm run test:e2e
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
```

**What it tests:**

- Chromium (light theme)
- Chromium (dark theme)
- Firefox
- WebKit (Safari)
- Mobile Chrome
- Mobile Safari

**Artifacts:**

- `playwright-report/` - HTML test report with traces (30 days)
- Screenshots of failed tests
- Video recordings (if enabled)

### 4. Accessibility

Dedicated accessibility test suite.

```yaml
accessibility:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npx playwright test e2e/accessibility.spec.ts
```

**What it checks:**

- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader compatibility
- Color contrast
- ARIA attributes

**Artifacts:**

- `playwright-report/` - Detailed a11y violation reports

### 5. Gate

Requires all previous jobs to pass.

```yaml
gate:
  runs-on: ubuntu-latest
  needs: [lint, unit-tests, e2e-tests, accessibility]
  steps:
    - run: echo "All tests passed!"
```

This job provides a single status check for branch protection rules.

## Setup Instructions

### 1. Enable Workflow

The workflow is already committed. Enable it in repository settings:

1. Go to **Settings > Actions > General**
2. Set **Actions permissions** to "Allow all actions"
3. Enable **Read and write permissions** for workflows

### 2. Configure Codecov (Optional)

For coverage reports:

1. Sign up at [codecov.io](https://codecov.io)
2. Add your repository
3. Add `CODECOV_TOKEN` secret to repository settings

### 3. Branch Protection

Require tests to pass before merging:

1. Go to **Settings > Branches**
2. Add rule for `main` branch
3. Enable "Require status checks to pass"
4. Select `gate` as required check

## Debugging CI Failures

### Lint Failures

**Common causes:**

- ESLint rule violations
- TypeScript type errors
- Unused imports

**Fix:**

```bash
npm run lint        # See errors locally
npm run lint -- --fix  # Auto-fix where possible
```

### Unit Test Failures

**Common causes:**

- Missing mocks or setup
- Flaky async tests
- Environment differences (jsdom vs browser)

**Debug:**

```bash
npm run test:coverage  # Run locally with same settings
npm test -- --reporter=verbose  # Detailed output
```

### E2E Test Failures

**Common causes:**

- Server not starting in CI
- Browser compatibility issues
- Timing/race conditions
- Screenshot diffs

**Debug:**

1. Download `playwright-report` artifact from failed run
2. Open `index.html` to see test traces
3. Check screenshots and console logs
4. Run locally with same browser:

```bash
npx playwright test --project=chromium-light
```

### Accessibility Failures

**Common causes:**

- Missing ARIA labels
- Insufficient color contrast
- Broken keyboard navigation
- Invalid HTML structure

**Debug:**

```bash
npx playwright test e2e/accessibility.spec.ts --project=chromium-light
npx playwright show-report  # See detailed violations
```

## Performance Optimization

### Cache Dependencies

Already configured:

```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
    cache-dependency-path: ui/web/package-lock.json
```

This caches `node_modules` between runs (~30s faster).

### Parallel Execution

Playwright automatically runs tests in parallel:

```typescript
// playwright.config.ts
workers: process.env.CI ? 2 : undefined,
```

CI uses 2 workers (Ubuntu has 2 cores). Local dev uses all cores.

### Selective Test Running

Only run tests when `ui/` changes:

```yaml
on:
  push:
    paths:
      - 'ui/web/**'
  pull_request:
    paths:
      - 'ui/web/**'
```

### Matrix Strategy (Future)

Run tests across multiple Node versions:

```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
```

## Artifacts

All artifacts retained for 30 days:

| Artifact              | Job          | Size     | Contents                  |
| --------------------- | ------------ | -------- | ------------------------- |
| `coverage`            | unit-tests   | ~500 KB  | HTML coverage report      |
| `playwright-report`   | e2e-tests    | ~5 MB    | HTML report + traces      |
| `playwright-report`   | accessibility| ~2 MB    | A11y violation details    |

Download artifacts from Actions tab > specific run > Artifacts section.

## Local CI Simulation

Run the same commands as CI:

```bash
# Lint
npm run lint

# Unit tests
npm run test:coverage

# E2E tests (install browsers first)
npx playwright install --with-deps
npm run test:e2e

# Accessibility
npx playwright test e2e/accessibility.spec.ts
```

## Monitoring

### Build Status Badge

Add to README.md:

```markdown
![UI Tests](https://github.com/YOUR_ORG/labframe/actions/workflows/ui-tests.yml/badge.svg)
```

### Codecov Badge

Add after configuring Codecov:

```markdown
![Coverage](https://codecov.io/gh/YOUR_ORG/labframe/branch/main/graph/badge.svg?flag=ui-tests)
```

## Troubleshooting

### "ENOSPC: System limit for number of file watchers reached"

**Cause:** Too many files for inotify on Linux.

**Fix:**

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### "Playwright browser not found"

**Cause:** Browsers not installed in CI.

**Fix:** Already handled by `npx playwright install --with-deps`.

### "Cannot find module '@/...'"

**Cause:** Path aliases not resolved.

**Fix:** Ensure `tsconfig.json` and `vitest.config.ts` have matching aliases.

### "Timed out waiting for webServer"

**Cause:** Next.js dev server didn't start in 120s.

**Fix:**

- Increase `timeout` in `playwright.config.ts`
- Check for build errors in CI logs
- Ensure `npm run dev` works locally

## Resources

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Playwright CI Guide](https://playwright.dev/docs/ci)
- [Codecov Documentation](https://docs.codecov.com/)
- [Vitest CI Integration](https://vitest.dev/guide/ci.html)
