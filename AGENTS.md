# LabFrame UI — Agent Playbook

## Scope and Ownership

- Covers everything inside this `ui/` repository.
- Ships the Next.js front-end and supporting assets.
- Deploy target is a browser-based UI hitting a FastAPI instance (separate `api/` repository) via
  Next.js rewrites.

## Local Environment

- Node.js 20 LTS (Next 16 requires Node ≥ 18; the repo standardises on
  version 20).
- From `ui/web/`: `npm install`, then `npm run dev` (rewrites `/api/*` to
  FastAPI on `http://localhost:8000`).
- FastAPI server lives in the separate `api/` repository; run with
  `cd ../api && uvicorn labframe_api.app:app --reload --port 8000` using the shared thesis venv
  (`~/Backend/python/venv/thesis/`).
- Lint with `npm run lint`. React Query Devtools are enabled in development
  (bottom-right toggle).

## Project Layout

- `web/`: UI layer
  - `app/`: Next.js app (Tailwind via `@import`)
    - `page.tsx`: route-level shell.
  - `components/`: UI primitives
    - `samples/`: samples grid (using AG Grid library)
  - `lib/`: REST client wrappers and React Query hooks.

## Persistence Trace (Samples Grid)

1. **Editor interaction (UI):** `web/components/samples/parameter-value-editor.tsx`

    - Custom AG Grid editor supports free text and dropdown suggestions.
    - `attemptCommit` trims the candidate and delegates to the grid’s
      `applyCandidate` callback on Enter, blur (when the dropdown is
      closed), or option click. Escape closes without committing.

2. **Grid-level commit (UI):** `applyParameterCandidate` in
   `web/components/samples/samples-page.tsx`

    - Validates and normalises the candidate against its
      `ParameterDefinition`.
    - Mutates the row’s `sample.parameters` map, triggers
      `commitParameterEdit`, and forces a cell refresh. Development-only
      logging reports skips (empty, invalid, no-change) versus accepted
      edits.

3. **Assignment + mutation dispatch (UI):** `commitParameterEdit` in
   `samples-page.tsx`

    - Uses `buildAssignments` to assemble the payload
      `{ name, value, unit_symbol? }` for every parameter on the sample.
    - Calls `useUpdateSampleParameters.mutate({ sampleId, assignments })`;
      verbose logs stay behind the `NODE_ENV !== "production"` guard.

4. **React Query data layer:** `web/lib/hooks/use-samples.ts`

    - `useUpdateSampleParameters` sends the mutation and invalidates the
      `"samples"` query key so downstream readers refetch.

5. **HTTP client (UI → API):** `web/lib/api.ts::updateSampleParameters`

    - Issues `POST /api/samples/{sampleId}/parameters` with
      `{ parameters: [...] }`.
    - Runs in the browser; the Next.js dev rewrite proxies calls to FastAPI.

6. **Edge rewrite:** `web/next.config.ts`

    - Proxies `/api/*` to `http://localhost:8000/*` during development.

7. **FastAPI bridge:** `api/src/labframe_api/app.py::record_parameters`

    - Validates the request (`RecordParametersPayload`) and calls
      `SampleService.record_parameters` from `labframe_core`.

8. **Application service (core):**
   `core/src/labframe_core/app/samples/services.py`

    - Opens a Unit of Work, converts DTOs to domain types, and invokes the
      domain use case.

9. **Domain use case:**
   `core/src/labframe_core/domain/use_cases.py::record_sample_parameters`

    - Applies business rules, persists via repositories, and commits the
      Unit of Work.

10. **Register/persistence layer:** `core/src/labframe_core/register`

    - `unit_of_work.py` coordinates the SQLAlchemy session and event
      dispatch.
    - `store.py::SampleRepository.record_parameters` performs the writes and
      raises domain events.

11. **Result propagation:**

    - On mutation success, React Query refetches samples. AG Grid receives
      the updated `SampleListItem` list and renders edited parameters via the
      column `valueGetter`.

### Old version: Persistence Trace (Samples Grid)

1. **Cell Editing (UI):**
   - Component: `web/components/samples/samples-page.tsx`.
   - Editor: `ParameterValueEditor` exposes an AG Grid cell editor that
     trims user input and commits the candidate **before** closing,
     ensuring both dropdown selections and typed entries trigger persistence.
   - `applyParameterCandidate` updates the row model and prepares the payload.
2. **Mutation Dispatch (UI):**
   - `handleCellValueChanged` runs when AG Grid commits an edit.
   - Normalises the candidate value again, updates the row node if the
     displayed text changed, and builds assignments via
     `buildAssignments`.
   - Calls `mutateSampleParameters` from `useUpdateSampleParameters` and
     logs debug info in development.
3. **React Query (UI data layer):**
   - Hook: `web/lib/hooks/use-samples.ts`.
   - Mutation invalidates the cached `"samples"` queries after success to
     refresh visible data.
4. **HTTP client (UI → API):**
   - Function: `web/lib/api.ts::updateSampleParameters`.
   - Sends `POST /api/samples/{sampleId}/parameters` with
     `{ parameters: [{ name, value, unit_symbol? }] }`.
   - Runs in the browser; relies on the Next.js rewrite to forward to
     FastAPI.
5. **Next.js Rewrite:**
   - Config: `web/next.config.ts`.
   - Proxies `/api/*` requests to `http://localhost:8000/*` during
     development.
6. **FastAPI Endpoint:**
   - Module: `api/src/labframe_api/app.py` (`record_parameters`).
   - Validates payloads with Pydantic (`RecordParametersPayload`), then
     calls the bootstrapped `SampleService.record_parameters` from
     `labframe_core`.
7. **Application Service (Core):**
   - File: `core/src/labframe_core/app/samples/services.py`
     (`SampleService.record_parameters`).
   - Validates DTOs, constructs domain `SampleParameterValue` objects, and
     invokes the domain use case.
8. **Domain Use Case:**
   - File: `core/src/labframe_core/domain/use_cases.py`
     (`record_sample_parameters`).
   - Delegates to the repository on the Unit of Work, then commits.
9. **Register Layer / Persistence:**
   - Unit of Work: `core/src/labframe_core/register/unit_of_work.py`
     opens a SQLAlchemy session, aggregates repositories, and commits or
     rolls back.
   - Repository: `core/src/labframe_core/register/store.py`
     (`SampleRepository.record_parameters`) persists values into SQLite and
     emits domain events.
10. **Result Propagation:**
    - The updated `SampleListItem` travels back through FastAPI, React Query
      updates the cache, and AG Grid reflects refreshed parameter values.

## Troubleshooting Checklist

- **No POST visible:** confirm `handleCellValueChanged` logs
  (`samples-grid: committing parameter edit`), ensure the cell editor commits
  (press Enter or blur), and watch the browser Network tab for
  `/api/samples/*/parameters`.
- **API 422/400 errors:** inspect FastAPI logs; payload validation failures
  report exact fields via `detail`.
- **Grid not showing updates:** ensure React Query cache is invalidated
  (`useUpdateSampleParameters` does this) and that the database rebuild scripts
  (`core/resources/db/scripts`) are up to date.
- **Backend offline:** without `uvicorn`, the Next.js rewrite will 502; start
  the FastAPI app before editing parameters.

## Coding Guidelines

- Strict TypeScript in `web/`; prefer functional React components and hooks.
- Tailwind utilities allowed via `@import` and custom utilities defined in
  `globals.css` (e.g., `text-subtle`).
- Keep React Query mutations co-located with the owning hook; use optimistic
  updates sparingly (current flow relies on server response).
- For UI edits touching persistence, always update this persistence trace if
  the flow changes materially.
