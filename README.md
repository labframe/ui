# LabFrame UI

This repository hosts the web experience for LabFrame, built with Next.js 15.

## Prerequisites

- Node.js 20+ (Next.js 15 requires the active LTS release).
- The `api/` repository must be running separately (see [LabFrame API](../api/README.md)).

## Frontend (Next.js 15)

```bash
cd ui/web
npm install
npm run dev
```

While `npm run dev` is running, open <http://localhost:3000>. Requests to
`/api/*` are proxied to the FastAPI server at <http://localhost:8000>.

### Included tooling

- Tailwind CSS v4 with design tokens compatible with shadcn/ui.
- shadcn/ui (add new components with `npx shadcn@latest add <component>`).
- React Query and AG Grid for data fetching and tabular rendering.

## Linting

- Frontend: `cd ui/web && npm run lint`

## Next steps

- Extend the AG Grid view with parameter filters and inline editing.
- Integrate authentication once the backend exposes principals.
