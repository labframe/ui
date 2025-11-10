# LabFrame UI (Web)

Next.js-based web interface for the LabFrame laboratory information management system.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit http://localhost:3000

**Note:** The FastAPI backend must be running on port 8000 for the app to function.

## Documentation

- **[Testing Guide](./docs/testing/README.md)** - Comprehensive testing documentation
  - [AG Grid Testing](./docs/testing/AG-GRID-TESTING.md) - Grid alignment tests
  - [CI/CD Setup](./docs/testing/CI-SETUP.md) - GitHub Actions workflow

## Scripts

```bash
# Development
npm run dev          # Start dev server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Testing
npm test             # Component tests (watch mode)
npm run test:run     # Component tests (single run)
npm run test:coverage # Coverage report
npm run test:e2e     # E2E tests (all browsers)
npm run test:e2e:ui  # E2E tests (interactive)
npm run test:all     # All tests
```

## Project Structure

```
web/
├── app/                    # Next.js app router
├── components/             # React components
│   ├── samples/           # Sample management UI
│   └── ui/                # Reusable UI primitives
├── lib/                    # Utilities and hooks
│   ├── api.ts             # API client
│   └── hooks/             # React Query hooks
├── config/                 # Build and test configs
│   ├── vitest.config.ts
│   └── playwright.config.ts
├── e2e/                    # Playwright E2E tests
├── tests/                  # Vitest setup and fixtures
│   ├── fixtures/          # Test data factories
│   └── mocks/             # MSW API mocks
└── docs/                   # Documentation
    └── testing/           # Testing guides
```

## Tech Stack

- **Framework:** Next.js 16 (React 19)
- **UI:** Tailwind CSS + Radix UI primitives
- **Data Grid:** AG Grid Community 34
- **Data Fetching:** TanStack Query (React Query) v5
- **Testing:**
  - Vitest + React Testing Library (component tests)
  - Playwright (E2E tests)
  - MSW (API mocking)
  - axe-core (accessibility)

## Configuration

Next.js rewrites `/api/*` requests to FastAPI backend during development:

```typescript
// next.config.ts
rewrites: async () => [
  {
    source: '/api/:path*',
    destination: 'http://localhost:8000/:path*',
  },
],
```

The FastAPI backend must be running:

```bash
cd ../api
source ~/Backend/python/venv/thesis/bin/activate
uvicorn labframe_api.app:app --reload
```

## Development

### Adding a New Component

1. Create component in `components/`
2. Add test file next to it (e.g., `button.test.tsx`)
3. Export from barrel file if needed

### Adding a New API Endpoint

1. Update `lib/api.ts` with new function
2. Add React Query hook in `lib/hooks/`
3. Add MSW handler in `tests/helpers/mocks/handlers.ts`
4. Write tests

### Running Tests

```bash
# Watch mode (TDD workflow)
npm test

# E2E with visual feedback
npm run test:e2e:ui

# Coverage report
npm run test:coverage
open coverage/index.html
```

See [Testing Guide](./docs/testing/README.md) for comprehensive documentation.

## Related

- [Core Package](../../core/) - Python backend engine
- [API Bridge](../api/) - FastAPI REST API
- [Documentation Site](../../docs/) - Full project documentation
