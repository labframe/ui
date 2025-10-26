# LabFrame UI

This repository hosts the in-progress web experience for LabFrame, powered by a
FastAPI backend (`api/`) and a Next.js frontend (`web/`).

## Prerequisites

- Python tooling must use the thesis virtual environment at `~/Backend/python/venv/thesis/`.
- Node.js 20+ (Next.js 15 requires the active LTS release).
- The `core/` repository must exist as a sibling so the API can import `labframe_core`.

## Backend (FastAPI)

```bash
cd ui/api
source ~/Backend/python/venv/thesis/bin/activate
pip install -e .
uvicorn labframe_api.app:app --reload --port 8000
```

The server uses `../db/database.sqlite` by default. Override with
`LABFRAME_DB_PATH` when needed.

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

- Backend:
	`cd ui/api && source ~/Backend/python/venv/thesis/bin/activate && ruff check .`
- Frontend: `cd ui/web && npm run lint`

## Next steps

- Extend the AG Grid view with parameter filters and inline editing.
- Integrate authentication once the backend exposes principals.
