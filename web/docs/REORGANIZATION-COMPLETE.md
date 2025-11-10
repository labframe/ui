# Test Directory Reorganization - Complete Summary

## Changes Made

### 1. ✅ E2E Tests Moved to `tests/e2e/`

**Before:**
```
web/
├── e2e/
│   ├── fixtures.ts
│   ├── samples.spec.ts
│   ├── accessibility.spec.ts
│   └── ag-grid-alignment.spec.ts
```

**After:**
```
web/
├── tests/
│   └── e2e/
│       ├── fixtures.ts
│       ├── samples.spec.ts
│       ├── accessibility.spec.ts
│       └── ag-grid-alignment.spec.ts
```

**Updated:**
- `config/playwright.config.ts`: `testDir: "../tests/e2e"`
- Report paths updated to `../tests/playwright-report` and `../tests/playwright-results.json`

### 2. ✅ Test Directory Organized into Subdirectories

**New structure:**
```
tests/
├── e2e/                    # End-to-end tests (Playwright)
│   ├── fixtures.ts
│   ├── samples.spec.ts
│   ├── accessibility.spec.ts
│   └── ag-grid-alignment.spec.ts
├── integration/            # Integration tests
│   └── samples-api.test.tsx
├── component/              # Component tests (ready for use)
├── unit/                   # Unit tests (ready for use)
├── helpers/                # Test utilities
│   ├── setup.ts
│   └── utils.tsx
├── mocks/                  # MSW mocks
│   ├── handlers.ts
│   └── server.ts
├── fixtures/               # Test data factories
│   ├── samples.ts
│   └── parameters.ts
├── coverage/               # Coverage reports (generated)
├── playwright-report/      # Playwright HTML reports (generated)
├── test-results/           # Playwright test results (generated)
└── playwright-results.json # Playwright JSON results (generated)
```

**Updated:**
- `config/vitest.config.ts`: 
  - `setupFiles: ["../tests/helpers/setup.ts"]`
  - `reportsDirectory: "../tests/coverage"`
  - `exclude: ["node_modules", ".next", "tests/e2e"]`
- `tests/integration/samples-api.test.tsx`: Import from `@/tests/helpers/utils`
- `.gitignore`: Updated paths to ignore generated files in `tests/`

### 3. ✅ Config Files Organized

**Moved to `config/`:**
- ✅ `eslint.config.mjs`
- ✅ `postcss.config.mjs`
- ✅ `vitest.config.ts` (already moved)
- ✅ `playwright.config.ts` (already moved)

**Must stay in root:**
- ❌ `package.json` - npm/Node.js requirement
- ❌ `next.config.ts` - Next.js hardcoded lookup
- ❌ `tsconfig.json` - TypeScript compiler requirement
- ❌ `next-env.d.ts` - Next.js auto-generated
- ❌ `components.json` - shadcn/ui tooling convention

**Updated:**
- `package.json`: `"lint": "eslint --config config/eslint.config.mjs"`

### 4. ✅ Report Directories Relocated

All test artifacts now go into `tests/`:
- `tests/coverage/` - Vitest coverage reports
- `tests/playwright-report/` - Playwright HTML reports
- `tests/test-results/` - Playwright test artifacts
- `tests/playwright-results.json` - Playwright JSON results

## File Structure After Reorganization

```
web/
├── config/                     # All movable configs
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   ├── vitest.config.ts
│   └── playwright.config.ts
├── tests/                      # All test-related files
│   ├── e2e/                   # E2E tests
│   ├── integration/           # Integration tests
│   ├── component/             # Component tests (empty, ready)
│   ├── unit/                  # Unit tests (empty, ready)
│   ├── helpers/               # Test utilities
│   ├── mocks/                 # API mocks
│   ├── fixtures/              # Test data
│   ├── coverage/              # Generated coverage
│   ├── playwright-report/     # Generated reports
│   └── test-results/          # Generated results
├── docs/                       # Documentation
│   ├── testing/
│   └── CONFIG-FILES-ANALYSIS.md
├── app/                        # Next.js app
├── components/                 # React components
├── lib/                        # Utilities
├── public/                     # Static assets
├── scripts/                    # Build scripts
├── types/                      # TypeScript types
├── .gitignore                  # Updated paths
├── components.json             # shadcn/ui (must stay)
├── next.config.ts              # Next.js (must stay)
├── next-env.d.ts               # Next.js (must stay)
├── package.json                # npm (must stay)
├── tsconfig.json               # TypeScript (must stay)
└── README.md
```

## Commands Updated

All test commands still work the same:

```bash
# Component/Unit tests
npm test                    # Watch mode
npm run test:run            # Single run
npm run test:coverage       # With coverage

# E2E tests
npm run test:e2e            # All browsers
npm run test:e2e:ui         # Interactive
npm run test:e2e:debug      # Debug mode

# Linting
npm run lint                # ESLint with new config path
```

## Benefits

1. **Cleaner project root** - Only essential files remain
2. **Organized test structure** - Clear separation by test type
3. **All test artifacts in one place** - Easy to clean/gitignore
4. **Future-ready** - `unit/` and `component/` directories ready for new tests
5. **Better discoverability** - Logical grouping makes files easy to find

## Migration Notes

### For Developers

1. ✅ Update imports in test files from `@/tests/utils` → `@/tests/helpers/utils`
2. ✅ E2E tests moved to `tests/e2e/` - imports use relative paths
3. ✅ All npm scripts work unchanged

### For CI/CD

No changes needed - all npm scripts work with the new paths.

## Known Issues

- `tests/integration/samples-api.test.tsx` has TypeScript errors with `wrapper` prop
  (pre-existing issue, not related to reorganization)

---

See [CONFIG-FILES-ANALYSIS.md](./CONFIG-FILES-ANALYSIS.md) for detailed explanation
of which config files can/cannot be moved and why.
