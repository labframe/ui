"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CellValueChangedEvent,
  ColDef,
  FirstDataRenderedEvent,
  GridApi,
  GridReadyEvent,
} from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

import { Filter } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useThemePreference } from "@/components/theme/theme-provider";
import type { ParameterDefinition, SampleListItem } from "@/lib/api";
import {
  useParameterDefinitions,
  useSamplesQuery,
  useUpdateSampleParameters,
} from "@/lib/hooks/use-samples";
import { ParameterValueEditor } from "@/components/samples/parameter-value-editor";

const PARAM_COLUMN_PREFIX = "param::";

interface BaseColumnConfig {
  id: string;
  label: string;
  defaultVisible?: boolean;
  lockToggle?: boolean;
  colDef: ColDef<SampleListItem>;
}

const BASE_COLUMN_CONFIG: ReadonlyArray<BaseColumnConfig> = [
  {
    id: "sample_id",
    label: "ID",
    lockToggle: true,
    colDef: {
      colId: "sample_id",
      field: "sample_id",
      headerName: "ID",
      maxWidth: 100,
      filter: "agNumberColumnFilter",
      pinned: "left",
      flex: 0,
    },
  },
  {
    id: "code",
    label: "Code",
    colDef: {
      colId: "code",
      field: "code",
      headerName: "Code",
      minWidth: 160,
    },
  },
  {
    id: "author_name",
    label: "Author",
    defaultVisible: false,
    colDef: {
      colId: "author_name",
      field: "author_name",
      headerName: "Author",
      minWidth: 160,
    },
  },
  {
    id: "dept_code",
    label: "Dept",
    colDef: {
      colId: "dept_code",
      field: "dept_code",
      headerName: "Dept",
      maxWidth: 140,
      flex: 0,
    },
  },
  {
    id: "prepared_on",
    label: "Prepared",
    defaultVisible: false,
    colDef: {
      colId: "prepared_on",
      field: "prepared_on",
      headerName: "Prepared",
      minWidth: 160,
    },
  },
  {
    id: "sequence_number",
    label: "Seq #",
    colDef: {
      colId: "sequence_number",
      field: "sequence_number",
      headerName: "Seq #",
      maxWidth: 120,
      filter: "agNumberColumnFilter",
      flex: 0,
    },
  },
  {
    id: "description",
    label: "Description",
    colDef: {
      colId: "description",
      field: "description",
      headerName: "Description",
      minWidth: 200,
    },
  },
];

ModuleRegistry.registerModules([AllCommunityModule]);

export function SamplesPage() {
  const {
    data: samples = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useSamplesQuery();
  const {
    data: parameterDefinitions = [],
    isLoading: areParameterDefinitionsLoading,
    isError: parameterDefinitionsError,
    error: parameterDefinitionsErrorValue,
  } = useParameterDefinitions();

  const updateSampleParameters = useUpdateSampleParameters();

  const gridApiRef = useRef<GridApi<SampleListItem> | null>(null);
  const { resolvedTheme } = useThemePreference();
  const [isMounted, setIsMounted] = useState(false);
  const columnMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [parameterNameFilter, setParameterNameFilter] = useState("");
  const [parameterValueFilter, setParameterValueFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const normalizedParameterNameFilter = parameterNameFilter.trim().toLowerCase();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isColumnMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        columnMenuRef.current?.contains(target) ||
        columnMenuAnchorRef.current?.contains(target)
      ) {
        return;
      }
      setIsColumnMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsColumnMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isColumnMenuOpen]);

  const isDark = resolvedTheme === "dark";
  const themeClass = useMemo(() => {
    if (!isMounted) {
      return "ag-theme-quartz";
    }
    return isDark ? "ag-theme-quartz-dark" : "ag-theme-quartz";
  }, [isDark, isMounted]);
  const gridClassName = `${themeClass} h-full w-full`;
  const gridComponents = useMemo(() => ({ parameterValueEditor: ParameterValueEditor }), []);

  const parameterGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const definition of parameterDefinitions) {
      if (definition.group_name) {
        groups.add(definition.group_name);
      }
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [parameterDefinitions]);

  const { hasValueByParameter, valuesByParameter } = useMemo(() => {
    const hasValue = new Map<string, boolean>();
    const valueSets = new Map<string, Set<string>>();

    for (const definition of parameterDefinitions) {
      hasValue.set(definition.name, false);
      valueSets.set(definition.name, new Set<string>());
    }

    for (const sample of samples) {
      const entries = Object.entries(sample.parameters ?? {});
      for (const [name, rawValue] of entries) {
        if (!valueSets.has(name)) {
          valueSets.set(name, new Set<string>());
        }
        if (!hasValue.has(name)) {
          hasValue.set(name, false);
        }
        const value = (rawValue ?? "").trim();
        if (value !== "") {
          hasValue.set(name, true);
          valueSets.get(name)!.add(value);
        }
      }
    }

    const valuesByParam = new Map<string, string[]>();
    valueSets.forEach((set, name) => {
      const values = Array.from(set)
        .filter((entry) => entry !== "")
        .sort((a, b) => a.localeCompare(b));
      valuesByParam.set(name, values);
    });

    return { hasValueByParameter: hasValue, valuesByParameter: valuesByParam };
  }, [parameterDefinitions, samples]);

  useEffect(() => {
    setColumnVisibility((previous) => {
      const isInitial = Object.keys(previous).length === 0;
      const next: Record<string, boolean> = {};

      for (const config of BASE_COLUMN_CONFIG) {
        const defaultVisible = config.defaultVisible ?? true;
        next[config.id] = previous[config.id] ?? defaultVisible;
      }

      let hasVisibleParameter = false;

      for (const definition of parameterDefinitions) {
        const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
        const defaultVisible = previous[colId] ?? (hasValueByParameter.get(definition.name) ?? false);
        next[colId] = defaultVisible;
        if (defaultVisible) {
          hasVisibleParameter = true;
        }
      }

      if (isInitial && !hasVisibleParameter) {
        for (const definition of parameterDefinitions.slice(0, 3)) {
          const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
          next[colId] = true;
        }
      }

      const prevKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (previous[key] !== next[key]) {
          return next;
        }
      }

      return previous;
    });
  }, [parameterDefinitions, hasValueByParameter]);

  const displayedParameterNames = useMemo(() => {
    const nameTerm = normalizedParameterNameFilter;

    return parameterDefinitions
      .filter((definition) => {
        const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
        const matchesGroup = groupFilter === "all" || definition.group_name === groupFilter;
        const matchesName = nameTerm.length === 0 || definition.name.toLowerCase().includes(nameTerm);
        const fallbackVisible = hasValueByParameter.get(definition.name) ?? false;
        const isToggledVisible =
          columnVisibility[colId] === undefined ? fallbackVisible : columnVisibility[colId];
        return matchesGroup && matchesName && isToggledVisible;
      })
      .map((definition) => definition.name);
  }, [columnVisibility, groupFilter, hasValueByParameter, normalizedParameterNameFilter, parameterDefinitions]);

  const filteredSamples = useMemo(() => {
    const valueTerm = parameterValueFilter.trim().toLowerCase();

    if (valueTerm.length === 0) {
      return samples;
    }

    if (displayedParameterNames.length === 0) {
      return [];
    }

    return samples.filter((sample) => {
      const parameters = sample.parameters ?? {};
      return displayedParameterNames.some((name) => {
        const value = parameters[name];
        return typeof value === "string" && value.toLowerCase().includes(valueTerm);
      });
    });
  }, [displayedParameterNames, parameterValueFilter, samples]);

  const baseColumnDefs = useMemo<ColDef<SampleListItem>[]>(
    () =>
      BASE_COLUMN_CONFIG.map((config) => ({
        ...config.colDef,
        hide: columnVisibility[config.id] === false,
      })),
    [columnVisibility],
  );

  const parameterColumnDefs = useMemo<ColDef<SampleListItem>[]>(() => {
    const nameTerm = normalizedParameterNameFilter;

      return parameterDefinitions.map((definition) => {
        const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
        const knownValues = valuesByParameter.get(definition.name) ?? [];
        const matchesGroup = groupFilter === "all" || definition.group_name === groupFilter;
        const matchesName = nameTerm.length === 0 || definition.name.toLowerCase().includes(nameTerm);
        const fallbackVisible = hasValueByParameter.get(definition.name) ?? false;
        const isToggledVisible =
          columnVisibility[colId] === undefined ? fallbackVisible : columnVisibility[colId];
        const shouldDisplay = matchesGroup && matchesName && isToggledVisible;

        return {
          headerName: definition.name,
          headerTooltip: definition.group_name,
          colId,
          minWidth: 160,
          valueGetter: (params) => params.data?.parameters?.[definition.name] ?? "",
          valueSetter: (params) => {
            const rawValue = params.newValue ?? "";
            const nextValue =
              typeof rawValue === "string" ? rawValue.trim() : String(rawValue ?? "").trim();
            const current = params.data?.parameters?.[definition.name] ?? "";
            if (current === nextValue) {
              return false;
            }

            const nextParameters = { ...(params.data?.parameters ?? {}) };
            if (nextValue === "") {
              delete nextParameters[definition.name];
            } else {
              nextParameters[definition.name] = nextValue;
            }
            if (params.data) {
              params.data.parameters = nextParameters;
            }
            return true;
          },
          editable: true,
          cellEditor: "parameterValueEditor",
          cellEditorParams: {
            values: knownValues,
          },
          hide: !shouldDisplay,
          filter: "agTextColumnFilter",
          floatingFilter: true,
        } satisfies ColDef<SampleListItem>;
      });
  }, [columnVisibility, groupFilter, hasValueByParameter, normalizedParameterNameFilter, parameterDefinitions, valuesByParameter]);

  const columnDefs = useMemo<ColDef<SampleListItem>[]>(
    () => [...baseColumnDefs, ...parameterColumnDefs],
    [baseColumnDefs, parameterColumnDefs],
  );

  const defaultColDef = useMemo<ColDef<SampleListItem>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: true,
      flex: 1,
      minWidth: 140,
      editable: false,
    }),
    [],
  );

  const handleGridReady = useCallback((event: GridReadyEvent<SampleListItem>) => {
    gridApiRef.current = event.api;
    event.api.sizeColumnsToFit();
  }, []);

  const handleFirstDataRendered = useCallback(
    (event: FirstDataRenderedEvent<SampleListItem>) => {
      event.api.sizeColumnsToFit();
    },
    [],
  );

  const handleToggleColumnMenu = useCallback(() => {
    setIsColumnMenuOpen((previous) => !previous);
  }, []);

  const handleColumnVisibilityChange = useCallback((columnId: string, visible: boolean) => {
    setColumnVisibility((previous) => {
      if (previous[columnId] === visible) {
        return previous;
      }
      return {
        ...previous,
        [columnId]: visible,
      };
    });
  }, []);

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<SampleListItem>) => {
      const colId = event.colDef.colId ?? "";
      if (!colId.startsWith(PARAM_COLUMN_PREFIX)) {
        return;
      }

      if (event.newValue === event.oldValue) {
        return;
      }

      const parameterName = colId.slice(PARAM_COLUMN_PREFIX.length);
      const rawValue = event.newValue ?? "";
      const nextValue =
        typeof rawValue === "string" ? rawValue.trim() : String(rawValue ?? "").trim();

      const currentParameters = { ...(event.data.parameters ?? {}) };
      if (nextValue === "") {
        delete currentParameters[parameterName];
      } else {
        currentParameters[parameterName] = nextValue;
      }

      updateSampleParameters.mutate({
        sampleId: event.data.sample_id,
        parameters: currentParameters,
      });
    },
    [updateSampleParameters],
  );

  const parameterGroupSelectDisabled = parameterDefinitions.length === 0 && areParameterDefinitionsLoading;

  return (
    <main className="flex h-screen min-h-screen flex-col gap-6 bg-background p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Samples</h1>
          <p className="text-sm text-muted-foreground">
            Browse the local LabFrame sample catalog backed by the FastAPI service.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button
              ref={columnMenuAnchorRef}
              type="button"
              className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={handleToggleColumnMenu}
              aria-expanded={isColumnMenuOpen}
              aria-haspopup="menu"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              Columns
            </button>
            {isColumnMenuOpen ? (
              <div
                ref={columnMenuRef}
                role="menu"
                aria-label="Toggle columns"
                className="absolute right-0 z-20 mt-2 w-72 rounded-md border border-border/60 bg-popover p-3 text-sm shadow-lg"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Core columns
                </p>
                <ul className="space-y-1">
                  {BASE_COLUMN_CONFIG.map((config) => {
                    const fallbackVisible = config.defaultVisible ?? true;
                    const isChecked = columnVisibility[config.id] ?? fallbackVisible;
                    const inputId = `column-toggle-${config.id}`;
                    return (
                      <li key={config.id} className="flex items-center gap-2">
                        <input
                          id={inputId}
                          type="checkbox"
                          className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          checked={isChecked}
                          onChange={(event) =>
                            handleColumnVisibilityChange(config.id, event.target.checked)
                          }
                          disabled={config.lockToggle}
                        />
                        <label
                          htmlFor={inputId}
                          className="flex flex-1 items-center justify-between gap-2 cursor-pointer select-none text-sm text-foreground"
                        >
                          <span>{config.label}</span>
                          {config.lockToggle ? (
                            <span className="text-xs font-medium text-muted-foreground">Pinned</span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 border-t border-border/40 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Parameter columns
                  </p>
                  {parameterDefinitions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No parameter metadata available.</p>
                  ) : (
                    <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {parameterDefinitions.map((definition) => {
                        const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
                        const fallbackVisible = hasValueByParameter.get(definition.name) ?? false;
                        const isChecked = columnVisibility[colId] ?? fallbackVisible;
                        const matchesGroup =
                          groupFilter === "all" || definition.group_name === groupFilter;
                        const matchesName =
                          normalizedParameterNameFilter.length === 0 ||
                          definition.name.toLowerCase().includes(normalizedParameterNameFilter);
                        const optionId = `column-toggle-${colId}`;
                        return (
                          <li key={colId} className="flex items-start gap-2">
                            <input
                              id={optionId}
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              checked={isChecked}
                              onChange={(event) =>
                                handleColumnVisibilityChange(colId, event.target.checked)
                              }
                            />
                            <label
                              htmlFor={optionId}
                              className="flex flex-1 flex-col gap-0.5 cursor-pointer select-none"
                            >
                              <span className="text-sm text-foreground">{definition.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {definition.group_name ?? "Ungrouped"}
                                {!matchesGroup || !matchesName ? " • filtered" : ""}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <ThemeToggle />
          <button
            type="button"
            className="h-9 rounded-md border px-3 text-sm"
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

      <section className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-muted/30 px-4 py-3">
          <label className="text-sm">
            <span className="sr-only">Parameter group</span>
            <select
              className="h-9 rounded border border-border bg-background px-3 text-sm"
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              disabled={parameterGroupSelectDisabled}
            >
              <option value="all">All parameter groups</option>
              {parameterGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Parameter name</span>
            <input
              type="text"
              className="h-9 w-48 rounded border border-border bg-background px-3 text-sm"
              placeholder="Filter parameter name"
              value={parameterNameFilter}
              onChange={(event) => setParameterNameFilter(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Parameter value</span>
            <input
              type="text"
              className="h-9 w-48 rounded border border-border bg-background px-3 text-sm"
              placeholder="Filter parameter value"
              value={parameterValueFilter}
              onChange={(event) => setParameterValueFilter(event.target.value)}
            />
          </label>
        </div>

        {parameterDefinitionsError ? (
          <p className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {parameterDefinitionsErrorValue?.message ?? "Failed to load parameter metadata."}
          </p>
        ) : null}

        <div className="flex-1 min-h-[480px]">
          <div className="h-full w-full">
            <AgGridReact<SampleListItem>
              key={isMounted ? (isDark ? "dark" : "light") : "light"}
              rowData={filteredSamples}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              animateRows
              suppressNoRowsOverlay={!isLoading && filteredSamples.length > 0}
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              className={gridClassName}
              components={gridComponents}
              theme="legacy"
              onGridReady={handleGridReady}
              onFirstDataRendered={handleFirstDataRendered}
              onCellValueChanged={handleCellValueChanged}
            />
          </div>
        </div>

        {isLoading ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Loading samples…</p>
        ) : null}
      </section>
    </main>
  );
}
