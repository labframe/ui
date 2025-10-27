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
    },
  },
  {
    id: "dept_code",
    label: "Dept",
    colDef: {
      colId: "dept_code",
      field: "dept_code",
      headerName: "Dept",
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
    },
  },
];
const CHARACTER_PIXEL_WIDTH = 8;
const COLUMN_PADDING_PX = 28;
const EXTRA_CHAR_PADDING = 2;
const MIN_COLUMN_WIDTH = 56;

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsColumnMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
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

  const parameterGroupEntries = useMemo(() => {
    const map = new Map<string, ParameterDefinition[]>();

    for (const definition of parameterDefinitions) {
      const key = definition.group_name?.trim() ? definition.group_name.trim() : "Ungrouped";
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(definition);
    }

    return Array.from(map.entries())
      .map(([groupName, definitions]) => [groupName, definitions.sort((a, b) => a.name.localeCompare(b.name))] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [parameterDefinitions]);

  const hasVisibleParameterMatches = useMemo(() => {
    return parameterGroupEntries.some(([groupName, definitions]) => {
      if (groupFilter !== "all" && groupFilter !== groupName) {
        return false;
      }
      return definitions.some((definition) => {
        if (normalizedParameterNameFilter.length === 0) {
          return true;
        }
        return definition.name.toLowerCase().includes(normalizedParameterNameFilter);
      });
    });
  }, [groupFilter, normalizedParameterNameFilter, parameterGroupEntries]);

  const baseColumnWidths = useMemo(() => {
    const widths: Record<string, number> = {};

    for (const config of BASE_COLUMN_CONFIG) {
      const fieldName = typeof config.colDef.field === "string" ? config.colDef.field : null;

      let maxContentLength = 0;

      if (fieldName) {
        for (const sample of samples) {
          const value = sample[fieldName as keyof SampleListItem];
          const text = value == null ? "" : String(value);
          maxContentLength = Math.max(maxContentLength, text.length);
        }
      }

      const effectiveLength =
        maxContentLength > 0
          ? maxContentLength + EXTRA_CHAR_PADDING
          : config.label.length + EXTRA_CHAR_PADDING;

      const calculatedWidth = Math.max(
        MIN_COLUMN_WIDTH,
        effectiveLength * CHARACTER_PIXEL_WIDTH + COLUMN_PADDING_PX,
      );

      widths[config.id] = calculatedWidth;
    }

    return widths;
  }, [samples]);

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

  const parameterColumnWidths = useMemo(() => {
    const widths = new Map<string, number>();

    for (const definition of parameterDefinitions) {
      let maxContentLength = 0;

      for (const sample of samples) {
        const rawValue = sample.parameters?.[definition.name];
        const text = rawValue == null ? "" : String(rawValue);
        maxContentLength = Math.max(maxContentLength, text.length);
      }

      const knownValues = valuesByParameter.get(definition.name) ?? [];
      for (const value of knownValues) {
        maxContentLength = Math.max(maxContentLength, value.length);
      }

      const effectiveLength =
        maxContentLength > 0
          ? maxContentLength + EXTRA_CHAR_PADDING
          : definition.name.length + EXTRA_CHAR_PADDING;

      const calculatedWidth = Math.max(
        MIN_COLUMN_WIDTH,
        effectiveLength * CHARACTER_PIXEL_WIDTH + COLUMN_PADDING_PX,
      );

      widths.set(definition.name, calculatedWidth);
    }

    return widths;
  }, [parameterDefinitions, samples, valuesByParameter]);

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
        headerTooltip: config.label,
        hide: columnVisibility[config.id] === false,
        width: baseColumnWidths[config.id] ?? MIN_COLUMN_WIDTH,
        suppressSizeToFit: true,
      })),
    [baseColumnWidths, columnVisibility],
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
        const calculatedWidth = parameterColumnWidths.get(definition.name) ?? 120;

        const tooltip = definition.group_name
          ? `${definition.name} • ${definition.group_name}`
          : definition.name;

        return {
          headerName: definition.name,
          headerTooltip: tooltip,
          colId,
          width: calculatedWidth,
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
          suppressSizeToFit: true,
        } satisfies ColDef<SampleListItem>;
      });
    }, [columnVisibility, groupFilter, hasValueByParameter, normalizedParameterNameFilter, parameterColumnWidths, parameterDefinitions, valuesByParameter]);

  const fillerColumnDef = useMemo<ColDef<SampleListItem>>(
    () => ({
      colId: "__padding__",
      headerName: "",
      valueGetter: () => "",
      resizable: false,
      sortable: false,
      filter: false,
      editable: false,
      suppressMenu: true,
      suppressMovable: true,
      width: 1,
      flex: 1,
      cellClass: "ag-filler-cell",
      headerClass: "ag-filler-header",
    }),
    [],
  );

  const columnDefs = useMemo<ColDef<SampleListItem>[]>(
    () => [...baseColumnDefs, ...parameterColumnDefs, fillerColumnDef],
    [baseColumnDefs, fillerColumnDef, parameterColumnDefs],
  );

  const defaultColDef = useMemo<ColDef<SampleListItem>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: true,
      flex: 0,
      minWidth: 90,
      editable: false,
    }),
    [],
  );

  const handleGridReady = useCallback((event: GridReadyEvent<SampleListItem>) => {
    gridApiRef.current = event.api;
  }, []);

  const handleFirstDataRendered = useCallback(
    (event: FirstDataRenderedEvent<SampleListItem>) => {
      event.api.refreshHeader();
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
              type="button"
              className={`flex h-9 items-center gap-2 rounded border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isColumnMenuOpen
                  ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                  : "border-border bg-muted text-foreground hover:bg-muted/80"
              }`}
              onClick={handleToggleColumnMenu}
              aria-expanded={isColumnMenuOpen}
              aria-haspopup="dialog"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              Columns
            </button>
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
              className="h-9 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
              className="h-9 w-48 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              placeholder="Filter parameter name"
              value={parameterNameFilter}
              onChange={(event) => setParameterNameFilter(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Parameter value</span>
            <input
              type="text"
              className="h-9 w-48 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
          <div className="relative h-full w-full">
            <AgGridReact<SampleListItem>
              key={isMounted ? (isDark ? "dark" : "light") : "light"}
              rowData={filteredSamples}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              animateRows
              suppressNoRowsOverlay={!isLoading && filteredSamples.length > 0}
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              className={`${gridClassName} ${isColumnMenuOpen ? "pointer-events-none" : ""}`}
              components={gridComponents}
              theme="legacy"
              onGridReady={handleGridReady}
              onFirstDataRendered={handleFirstDataRendered}
              onCellValueChanged={handleCellValueChanged}
            />
            {isColumnMenuOpen ? (
              <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-popover">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Column visibility</h2>
                    <p className="text-xs text-muted-foreground">
                      Toggle core fields and parameter groups. Changes apply immediately.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={handleToggleColumnMenu}
                  >
                    Done
                  </button>
                </header>
                <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 py-4 md:flex-row">
                  <section className="w-full max-w-md shrink-0 space-y-3 overflow-y-auto pr-2 md:max-w-sm md:border-r md:border-border/60 md:pr-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Core columns
                    </p>
                    <ul className="space-y-2">
                      {BASE_COLUMN_CONFIG.map((config) => {
                        const fallbackVisible = config.defaultVisible ?? true;
                        const isChecked = columnVisibility[config.id] ?? fallbackVisible;
                        const inputId = `column-toggle-${config.id}`;
                        return (
                          <li key={config.id}>
                            <label
                              htmlFor={inputId}
                              className="flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border"
                            >
                              <input
                                id={inputId}
                                type="checkbox"
                                className="column-toggle-checkbox h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                checked={isChecked}
                                onChange={(event) =>
                                  handleColumnVisibilityChange(config.id, event.target.checked)
                                }
                                disabled={config.lockToggle}
                              />
                              <span className="flex flex-1 items-center justify-between gap-2 text-foreground">
                                {config.label}
                                {config.lockToggle ? (
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Pinned
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                  <section className="flex-1 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Parameter groups
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            groupFilter === "all"
                              ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                              : "border-border/60 text-muted-foreground hover:border-border"
                          }`}
                          onClick={() => setGroupFilter("all")}
                        >
                          All groups
                        </button>
                        {parameterGroupEntries.map(([groupName]) => (
                          <button
                            key={groupName}
                            type="button"
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              groupFilter === groupName
                                ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                                : "border-border/60 text-muted-foreground hover:border-border"
                            }`}
                            onClick={() => setGroupFilter(groupName)}
                          >
                            {groupName}
                          </button>
                        ))}
                      </div>
                    </div>
                    {parameterGroupEntries.length === 0 ? (
                      <p className="mt-4 text-xs text-muted-foreground">
                        No parameter metadata available.
                      </p>
                    ) : !hasVisibleParameterMatches ? (
                      <p className="mt-4 text-xs text-muted-foreground">
                        No parameters match the current group or name filters.
                      </p>
                    ) : (
                      <div className="mt-4 h-full overflow-y-auto space-y-4 pr-2">
                        {parameterGroupEntries
                          .filter(([groupName]) => groupFilter === "all" || groupFilter === groupName)
                          .map(([groupName, definitions]) => {
                            const visibleDefinitions = definitions.filter((definition) => {
                              if (normalizedParameterNameFilter.length === 0) {
                                return true;
                              }
                              return definition.name
                                .toLowerCase()
                                .includes(normalizedParameterNameFilter);
                            });

                            if (visibleDefinitions.length === 0) {
                              return null;
                            }

                            return (
                              <section key={groupName} className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {groupName}
                                </h3>
                                <ul className="space-y-1">
                                  {visibleDefinitions.map((definition) => {
                                    const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
                                    const fallbackVisible = hasValueByParameter.get(definition.name) ?? false;
                                    const isChecked = columnVisibility[colId] ?? fallbackVisible;
                                    const optionId = `column-toggle-${colId}`;
                                    const metaDetails: string[] = [];
                                    if (definition.data_type) {
                                      metaDetails.push(definition.data_type);
                                    }
                                    if (definition.mode) {
                                      metaDetails.push(
                                        definition.mode === "fixed"
                                          ? "Fixed value"
                                          : definition.mode.replace(/_/g, " "),
                                      );
                                    }
                                    const metaText = metaDetails.join(" • ");
                                    return (
                                      <li key={colId}>
                                        <label
                                          htmlFor={optionId}
                                          className="flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border"
                                        >
                                          <input
                                            id={optionId}
                                            type="checkbox"
                                            className="column-toggle-checkbox h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                            checked={isChecked}
                                            onChange={(event) =>
                                              handleColumnVisibilityChange(colId, event.target.checked)
                                            }
                                          />
                                          <span className="flex flex-col text-foreground">
                                            <span>{definition.name}</span>
                                            {metaText ? (
                                              <span className="text-xs text-muted-foreground">{metaText}</span>
                                            ) : null}
                                          </span>
                                        </label>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </section>
                            );
                          })}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Loading samples…</p>
        ) : null}
      </section>
    </main>
  );
}
