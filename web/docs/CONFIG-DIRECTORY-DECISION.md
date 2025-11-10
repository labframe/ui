# Config Directory Analysis

## Current Situation

We have a `config/` directory with only **3 files**, all test-related:
```
config/
├── eslint.config.mjs
├── vitest.config.ts
└── playwright.config.ts
```

## Question: Should this be `tests/config/` instead?

### Arguments FOR Moving to `tests/config/`

1. **All 3 files are test-related**
   - ESLint (lints test files too, but primarily for tests)
   - Vitest (unit/component test runner)
   - Playwright (E2E test runner)

2. **Cleaner root directory**
   - One less directory at root level
   - All test infrastructure in one place

3. **Logical grouping**
   ```
   tests/
   ├── config/           # Test tool configs
   ├── e2e/              # E2E tests
   ├── integration/      # Integration tests
   ├── helpers/          # Test utilities
   └── results/          # Generated artifacts
   ```

### Arguments AGAINST (Keep root `config/`)

1. **ESLint is not just for tests**
   - Lints `app/`, `components/`, `lib/` too
   - General code quality tool

2. **Future expansion potential**
   - TypeScript might add `tsconfig.build.json`, `tsconfig.test.json` (could go in `config/`)
   - Prettier config (if added) - `.prettierrc.json`
   - Bundler configs if you add Webpack/Rollup plugins
   - Environment configs (`.env.example`, env schemas)
   - Docker configs (`docker-compose.yml`)
   - CI/CD configs (though usually in `.github/workflows/`)

3. **Industry convention**
   - Many projects have root `config/` for various tools
   - Separates "how to build/test/lint" from "what to build/test"

## Recommendation

**Move to `tests/config/`** ✅

**Why:**
- **Pragmatic**: All 3 current files ARE test-related
- **YAGNI principle**: Don't create infrastructure for hypothetical future files
- **If future needs arise**, you can:
  - Create root `config/` again when you have non-test configs
  - Or put them directly in root (like `postcss.config.mjs`)
  - Or create domain-specific dirs (`docker/`, `.github/`, etc.)

**Cleaner structure:**
```
web/
├── postcss.config.mjs          # Essential
├── package.json                # Essential  
├── next.config.ts              # Essential
├── tsconfig.json               # Essential
├── next-env.d.ts               # Generated
├── components.json             # Essential
├── tests/
│   ├── config/                 # Test tool configs
│   │   ├── eslint.config.mjs
│   │   ├── vitest.config.ts
│   │   └── playwright.config.ts
│   ├── e2e/
│   ├── helpers/
│   └── results/
├── app/
├── components/
├── docs/
└── lib/
```

## Alternative: Keep Root `config/` If...

Keep root `config/` if you plan to add soon:
- Docker configs
- Multiple TypeScript configs
- Build tool configs (Webpack, Rollup)
- Formatter configs (Prettier)
- Git hooks configs (Husky)

Otherwise, move to `tests/config/` now and refactor later if needed.

## Decision

Move all 3 configs to `tests/config/` unless you know you'll add non-test configs soon.
