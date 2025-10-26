"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColDef, GridApi, GridReadyEvent } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useThemePreference } from "@/components/theme/theme-provider";
import type { SampleListItem } from "@/lib/api";
import { useSamplesQuery } from "@/lib/hooks/use-samples";

ModuleRegistry.registerModules([AllCommunityModule]);

export function SamplesPage() {
  const { data: samples = [], isLoading, isError, error, refetch, isRefetching } =
    useSamplesQuery();

  const gridApiRef = useRef<GridApi<SampleListItem> | null>(null);
  const { resolvedTheme } = useThemePreference();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";
  const themeClass = useMemo(() => {
    if (!isMounted) {
      return "ag-theme-quartz";
    }
    return isDark ? "ag-theme-quartz-dark" : "ag-theme-quartz";
  }, [isDark, isMounted]);

  const columnDefs = useMemo<ColDef<SampleListItem>[]>(
    () => [
      { field: "sample_id", headerName: "ID", maxWidth: 100 },
      { field: "code", headerName: "Code", flex: 1, minWidth: 160 },
      { field: "author_name", headerName: "Author", minWidth: 160 },
      { field: "dept_code", headerName: "Dept", maxWidth: 140 },
      { field: "prepared_on", headerName: "Prepared", minWidth: 160 },
      { field: "sequence_number", headerName: "Seq #", maxWidth: 120 },
    ],
    [],
  );

  const handleGridReady = (event: GridReadyEvent<SampleListItem>) => {
    gridApiRef.current = event.api;
  };

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Samples</h1>
          <p className="text-sm text-muted-foreground">
            Browse the local LabFrame sample catalog backed by the FastAPI service.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-md border px-3 py-1 text-sm"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
          >
            {isRefetching ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      {isError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error?.message ?? "Failed to load samples."}
        </p>
      ) : null}

      <section className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div style={{ height: 480, width: "100%" }}>
          <AgGridReact<SampleListItem>
            key={isMounted ? (isDark ? "dark" : "light") : "light"}
            rowData={samples}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            animateRows
            loading={isLoading || isRefetching}
            className={themeClass}
            theme="legacy"
            onGridReady={handleGridReady}
          />
        </div>
        {isLoading ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Loading samples…</p>
        ) : null}
      </section>
    </main>
  );
}
