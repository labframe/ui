# Configuration File Organization Philosophy

## Your Questions

### 1. Should test configs be in root `config/` or `tests/config/`?

**Recommendation: Keep in root `config/` directory** ✅

**Why:**

#### Pattern Consistency
- Having a root `config/` mirrors having a root `docs/` with subdirectories
- Creates a predictable top-level structure: `config/`, `docs/`, `tests/`, `app/`, etc.
- Makes it immediately clear where ALL configs live

#### Tool Discovery
- Many tools scan the project root for configs by default
- Having `config/vitest.config.ts` and `config/playwright.config.ts` in the same place as `config/eslint.config.mjs` creates one source of truth
- Easier to reference in scripts: all use `--config config/[name]`

#### Separation of Concerns
- `tests/` contains test **code** (test files, fixtures, helpers)
- `config/` contains **configuration** (build, lint, test runners)
- `docs/` contains **documentation**

This is a clean conceptual separation.

### 2. Is it smart to move configs when 5 must stay in root?

**Yes, still worth moving what you can** ✅

**Why:**

#### Practical Benefits

**Before (chaotic):**
```
web/
├── package.json             ← Must stay
├── next.config.ts           ← Must stay
├── tsconfig.json            ← Must stay
├── next-env.d.ts            ← Must stay
├── components.json          ← Must stay
├── postcss.config.mjs       ← Must stay (PostCSS/Next.js requirement)
├── eslint.config.mjs        ← Can move
├── vitest.config.ts         ← Can move
├── playwright.config.ts     ← Can move
├── app/
├── components/
└── ... (12+ root files)
```

**After (organized):**
```
web/
├── package.json             ← Essential (npm entry point)
├── next.config.ts           ← Essential (Next.js)
├── tsconfig.json            ← Essential (TypeScript)
├── next-env.d.ts            ← Generated (Next.js)
├── components.json          ← Convention (shadcn/ui)
├── postcss.config.mjs       ← Essential (PostCSS/Next.js)
├── config/                  ← Config home
│   ├── eslint.config.mjs
│   ├── vitest.config.ts
│   └── playwright.config.ts
├── app/
├── components/
└── ... (6 essential files + 1 config dir)
```

#### The Improvement

**Root file count:**
- Before: 12+ files
- After: 6 essential files + 1 config directory

**Mental model:**
- Before: "Is this config movable? I don't know where to look"
- After: "Check `config/` first. If not there, it MUST be in root for tool requirements"

#### The 6 Immovable Files Are Fundamentally Different

These aren't configs you chose—they're **requirements** of the ecosystem:

1. **`package.json`** - Defines the npm package (spec requirement)
2. **`next.config.ts`** - Framework requirement (Next.js)
3. **`tsconfig.json`** - Compiler requirement (TypeScript)
4. **`next-env.d.ts`** - Generated file (Next.js)
5. **`components.json`** - Ecosystem convention (shadcn/ui CLI)
6. **`postcss.config.mjs`** - **PostCSS/Next.js requirement** (CSS processing pipeline)

They're in root because **they have no choice**. Moving the others clarifies this distinction.

### 3. Alternative: Move everything back to root?

**Not recommended** ❌

**Why:**

- You'd be back to 12+ root files
- Harder to find what you're looking for
- No clear organization principle
- Many projects (like Nx monorepos, Angular CLI, etc.) use root `config/` dirs successfully

## Industry Patterns

### Popular Projects with `config/` dirs:

- **Next.js apps** - Often have `config/` for custom configs
- **Nx monorepos** - Use `config/` extensively
- **Jest projects** - Often `config/jest.config.js`
- **Webpack** - Often `config/webpack.config.js`
- **Large TypeScript projects** - May have `tsconfig.base.json` stay in root, but extended configs in `config/`

### The Pattern:

```
Root = Immovable essentials + top-level directories
├── package.json              (immovable)
├── tsconfig.json             (immovable)
├── [framework].config.*      (immovable)
├── config/                   (movable configs)
├── src/                      (source code)
├── tests/                    (test code)
├── docs/                     (documentation)
└── ...
```

## Recommendation

**Keep your current structure:**

```
web/
├── config/           # All movable configs
├── tests/            # All test code + results
├── docs/             # All documentation
├── app/              # Next.js app
├── components/       # React components
├── lib/              # Utilities
└── [5 root files]    # Only ecosystem requirements
```

**Benefits:**
1. ✅ Cleaner root directory (5 files vs 12+)
2. ✅ Predictable organization
3. ✅ One place to find configs: `config/`
4. ✅ Clear distinction: "Can't find it in `config/`? Must be a root requirement"
5. ✅ Easier onboarding: "Check `config/`, `tests/`, or `docs/` first"

## The Bottom Line

**Moving 4 configs to `config/` while leaving 5 in root is absolutely worth it.**

Why? Because those 5 **must** be in root—they're not optional. By moving what you can, you:

1. Reduce clutter
2. Create clear patterns
3. Make exceptions (root files) obvious
4. Follow a common industry pattern

Think of it like this: You can't control that some files must be in root (ecosystem requirements), but you CAN control where everything else goes (your choice). Making that choice explicit by having a `config/` directory is good architecture.

---

**Your current structure is excellent.** Don't second-guess it! 🎯
