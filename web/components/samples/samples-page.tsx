"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type {
  CellValueChangedEvent,
  ColDef,
  FirstDataRenderedEvent,
  GridApi,
  GridReadyEvent,
  IFilterOptionDef,
  ICellEditorParams,
  IRowNode,
  ValueGetterParams,
} from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

import { ChevronDown, Filter } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useThemePreference } from "@/components/theme/theme-provider";
import type { ParameterDefinition, SampleListItem, SampleParameterAssignment } from "@/lib/api";
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

const INTEGER_EPSILON = 1e-9;

function coerceNumeric(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(trimmed)) {
    return null;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function formatNumericDisplay(value: number): string {
  return Number.isInteger(value) ? value.toString() : String(value);
}

function createTextFilterParams() {
  return {
    defaultOption: "contains" as const,
    caseSensitive: false,
    debounceMs: 150,
  };
}

const NUMBER_TEXT_FILTER_OPTIONS: ReadonlyArray<IFilterOptionDef | string> = [
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "blank",
  "notBlank",
  {
    displayKey: "numericGreaterThan",
    displayName: "Greater than",
    predicate: ([rawFilter], rawValue) => {
      const filterValue = coerceNumeric(rawFilter);
      const cellValue = coerceNumeric(rawValue);
      if (filterValue == null || cellValue == null) {
        return false;
      }
      return cellValue > filterValue;
    },
  },
  {
    displayKey: "numericGreaterThanOrEqual",
    displayName: "Greater than or equal",
    predicate: ([rawFilter], rawValue) => {
      const filterValue = coerceNumeric(rawFilter);
      const cellValue = coerceNumeric(rawValue);
      if (filterValue == null || cellValue == null) {
        return false;
      }
      return cellValue >= filterValue;
    },
  },
  {
    displayKey: "numericLessThan",
    displayName: "Less than",
    predicate: ([rawFilter], rawValue) => {
      const filterValue = coerceNumeric(rawFilter);
      const cellValue = coerceNumeric(rawValue);
      if (filterValue == null || cellValue == null) {
        return false;
      }
      return cellValue < filterValue;
    },
  },
  {
    displayKey: "numericLessThanOrEqual",
    displayName: "Less than or equal",
    predicate: ([rawFilter], rawValue) => {
      const filterValue = coerceNumeric(rawFilter);
      const cellValue = coerceNumeric(rawValue);
      if (filterValue == null || cellValue == null) {
        return false;
      }
      return cellValue <= filterValue;
    },
  },
  {
    displayKey: "numericInRange",
    displayName: "In range",
    numberOfInputs: 2,
    predicate: ([rawFrom, rawTo], rawValue) => {
      const fromValue = coerceNumeric(rawFrom);
      const toValue = coerceNumeric(rawTo);
      const cellValue = coerceNumeric(rawValue);
      if (cellValue == null) {
        return false;
      }
      if (fromValue != null && cellValue < fromValue) {
        return false;
      }
      if (toValue != null && cellValue > toValue) {
        return false;
      }
      if (fromValue == null && toValue == null) {
        return false;
      }
      return true;
    },
  },
];

function createNumberTextFilterParams() {
  return {
    filterOptions: NUMBER_TEXT_FILTER_OPTIONS,
    defaultOption: "contains" as const,
    caseSensitive: false,
    debounceMs: 150,
  };
}

type NormalizedParameterValue = {
  value: string | number | boolean;
  displayValue: string;
  unitSymbol?: string | null;
};

function normalizeParameterValue(
  definition: ParameterDefinition | undefined,
  nextValue: string,
  _previousValue: string,
): NormalizedParameterValue | null {
  const trimmedNext = nextValue.trim();

  if (!definition) {
    if (!trimmedNext) {
      return null;
    }
    return {
      value: trimmedNext,
      displayValue: trimmedNext,
    };
  }

  const dataType = definition.data_type?.toUpperCase?.() ?? "";

  if (dataType === "INTEGER" || dataType === "REAL") {
    const numeric = coerceNumeric(trimmedNext);
    if (numeric == null) {
      return null;
    }

    if (dataType === "INTEGER") {
      const rounded = Math.round(numeric);
      if (Math.abs(numeric - rounded) > INTEGER_EPSILON) {
        return null;
      }
      return {
        value: rounded,
        displayValue: formatNumericDisplay(rounded),
      };
    }

    return {
      value: numeric,
      displayValue: formatNumericDisplay(numeric),
    };
  }

  if (dataType === "BOOLEAN") {
    const normalized = trimmedNext.toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) {
      return {
        value: true,
        displayValue: "true",
      };
    }
    if (["false", "0", "no"].includes(normalized)) {
      return {
        value: false,
        displayValue: "false",
      };
    }
    return null;
  }

  if (dataType === "DATE") {
    if (!trimmedNext) {
      return null;
    }
    return {
      value: trimmedNext,
      displayValue: trimmedNext,
    };
  }

  if (!trimmedNext) {
    return null;
  }

  return {
    value: trimmedNext,
    displayValue: trimmedNext,
  };
}

function normalizeDisplayValue(
  definition: ParameterDefinition | undefined,
  displayValue: string,
): NormalizedParameterValue | null {
  const candidate = typeof displayValue === "string" ? displayValue : String(displayValue ?? "");
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }
  return normalizeParameterValue(definition, trimmed, trimmed);
}

function buildAssignments(
  sample: SampleListItem,
  definitionMap: Map<string, ParameterDefinition>,
  overrides: Map<string, NormalizedParameterValue>,
): SampleParameterAssignment[] {
  const assignments: SampleParameterAssignment[] = [];
  const parameters = sample.parameters ?? {};

  for (const [name, displayValue] of Object.entries(parameters)) {
    if (overrides.has(name)) {
      continue;
    }
    const definition = definitionMap.get(name);
    const normalized = normalizeDisplayValue(definition, displayValue);
    if (!normalized) {
      continue;
    }
    const assignment: SampleParameterAssignment = {
      name,
      value: normalized.value,
    };
    if (normalized.unitSymbol != null) {
      assignment.unitSymbol = normalized.unitSymbol;
    }
    assignments.push(assignment);
  }

  for (const [name, normalized] of overrides.entries()) {
    const assignment: SampleParameterAssignment = {
      name,
      value: normalized.value,
    };
    if (normalized.unitSymbol != null) {
      assignment.unitSymbol = normalized.unitSymbol;
    }
    assignments.push(assignment);
  }

  return assignments;
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
      filter: "agTextColumnFilter",
      filterParams: createNumberTextFilterParams(),
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
      filter: "agTextColumnFilter",
      filterParams: createNumberTextFilterParams(),
      flex: 0,
    },
  },
];

const BASE_VALUE_FILTER_FIELDS: ReadonlyArray<keyof SampleListItem> = BASE_COLUMN_CONFIG
  .map((config) => (typeof config.colDef.field === "string" ? config.colDef.field : null))
  .filter((field): field is keyof SampleListItem => field != null);
const CHARACTER_PIXEL_WIDTH = 8;
const COLUMN_PADDING_PX = 28;
const EXTRA_CHAR_PADDING = 2;
const MIN_COLUMN_WIDTH = 56;
const PARAMETER_GROUP_SEED_ORDER = [
  "mxene_composition",
  "mxene_pre_process",
  "mxene_post_process",
  "mxene_product",
  "electrode_composition",
  "electrode_process",
  "electrode_product",
  "cell_composition",
  "cell_process",
  "cell_product",
  "measure_run",
  "measure_result",
] as const;

type ColumnPickerSelectionState = {
  mode: "all" | "custom";
  selections: string[];
};

interface ParameterGroupFilterControlProps {
  groups: string[];
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
}

function ParameterGroupFilterControl({ groups, value, onChange, disabled }: ParameterGroupFilterControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const label = value === "all" ? "All parameter groups" : value;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Filter parameter groups"
        onClick={() => {
          if (disabled) {
            return;
          }
          setIsOpen((previous) => !previous);
        }}
        disabled={disabled}
      >
  {label}
  <ChevronDown className="h-4 w-4 text-subtle" aria-hidden="true" />
      </button>
      {isOpen ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-48 overflow-hidden rounded-md border border-border bg-card shadow-lg"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                value === "all" ? "bg-muted font-medium" : "hover:bg-muted/60"
              }`}
              onClick={() => {
                onChange("all");
                setIsOpen(false);
              }}
            >
              All parameter groups
            </button>
          </li>
          {groups.map((group) => {
            const isActive = group === value;
            return (
              <li key={group}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    isActive ? "bg-muted font-medium" : "hover:bg-muted/60"
                  }`}
                  onClick={() => {
                    onChange(group);
                    setIsOpen(false);
                  }}
                >
                  {group}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

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

  const { mutate: mutateSampleParameters } = useUpdateSampleParameters();
  const gridApiRef = useRef<GridApi<SampleListItem> | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const [isGridReady, setIsGridReady] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const dragSourceGroupRef = useRef<string | null>(null);
  const dragActiveRef = useRef(false);
  const { resolvedTheme } = useThemePreference();
  const [isMounted, setIsMounted] = useState(false);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [columnPickerSelection, setColumnPickerSelection] = useState<ColumnPickerSelectionState>({
    mode: "all",
    selections: [],
  });
  const [parameterNameFilter, setParameterNameFilter] = useState("");
  const [parameterValueFilter, setParameterValueFilter] = useState("");
  const [groupOrder, setGroupOrder] = useState<string[]>(() => [...PARAMETER_GROUP_SEED_ORDER]);
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
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

  const definitionGroupNames = useMemo(() => {
    const groups = new Set<string>();
    for (const definition of parameterDefinitions) {
      const normalized = definition.group_name?.trim();
      if (normalized && normalized.length > 0) {
        groups.add(normalized);
      } else {
        groups.add("Ungrouped");
      }
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [parameterDefinitions]);

  useEffect(() => {
    setGroupOrder((previous) => {
      if (definitionGroupNames.length === 0) {
        return previous.length === 0 ? previous : [];
      }

      const definitionSet = new Set(definitionGroupNames);
      const next: string[] = [];
      const seen = new Set<string>();

      for (const seed of PARAMETER_GROUP_SEED_ORDER) {
        if (definitionSet.has(seed)) {
          next.push(seed);
          seen.add(seed);
        }
      }

      for (const value of previous) {
        if (definitionSet.has(value) && !seen.has(value)) {
          next.push(value);
          seen.add(value);
        }
      }

      for (const name of definitionGroupNames) {
        if (!seen.has(name)) {
          next.push(name);
          seen.add(name);
        }
      }

      if (next.length === previous.length && next.every((value, index) => value === previous[index])) {
        return previous;
      }

      return next;
    });
  }, [definitionGroupNames]);

  const parameterGroups = useMemo(() => {
    if (definitionGroupNames.length === 0) {
      return [];
    }

    const definitionSet = new Set(definitionGroupNames);
    const ordered = groupOrder.filter((name) => definitionSet.has(name));
    if (ordered.length === definitionGroupNames.length) {
      return ordered;
    }

    const missing = definitionGroupNames.filter((name) => !ordered.includes(name));
    return [...ordered, ...missing];
  }, [definitionGroupNames, groupOrder]);

  const parameterGroupEntries = useMemo(() => {
    const map = new Map<string, ParameterDefinition[]>();

    for (const definition of parameterDefinitions) {
      const key = definition.group_name?.trim() ? definition.group_name.trim() : "Ungrouped";
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(definition);
      } else {
        map.set(key, [definition]);
      }
    }

    const orderIndex = new Map(groupOrder.map((name, index) => [name, index] as const));

    return Array.from(map.entries())
      .map(
        ([groupName, definitions]) =>
          [groupName, definitions.sort((a, b) => a.name.localeCompare(b.name))] as const,
      )
      .sort((a, b) => {
        const indexA = orderIndex.get(a[0]);
        const indexB = orderIndex.get(b[0]);

        if (indexA != null && indexB != null) {
          if (indexA !== indexB) {
            return indexA - indexB;
          }
          return a[0].localeCompare(b[0]);
        }

        if (indexA != null) {
          return -1;
        }
        if (indexB != null) {
          return 1;
        }
        return a[0].localeCompare(b[0]);
      });
  }, [groupOrder, parameterDefinitions]);

  const allParameterGroupNames = useMemo(
    () => parameterGroupEntries.map(([groupName]) => groupName),
    [parameterGroupEntries],
  );

  useEffect(() => {
    if (groupFilter !== "all" && !parameterGroups.includes(groupFilter)) {
      setGroupFilter("all");
    }
  }, [groupFilter, parameterGroups]);

  const activeColumnMenuGroups = useMemo(() => {
    if (columnPickerSelection.mode === "all") {
      return allParameterGroupNames;
    }
    return columnPickerSelection.selections;
  }, [allParameterGroupNames, columnPickerSelection]);

  const areAllColumnMenuGroupsActive = columnPickerSelection.mode === "all" && allParameterGroupNames.length > 0;

  useEffect(() => {
    setColumnPickerSelection((previous) => {
      if (allParameterGroupNames.length === 0) {
        return { mode: "all", selections: [] };
      }

      if (previous.mode === "all") {
        return previous;
      }

      const nextSelections = previous.selections.filter((group) => allParameterGroupNames.includes(group));

      if (nextSelections.length === 0 || nextSelections.length === allParameterGroupNames.length) {
        return { mode: "all", selections: [] };
      }

      if (nextSelections.length === previous.selections.length) {
        return previous;
      }

      return { mode: "custom", selections: nextSelections };
    });
  }, [allParameterGroupNames]);

  const hasVisibleParameterMatches = useMemo(() => {
    if (activeColumnMenuGroups.length === 0) {
      return false;
    }

    return parameterGroupEntries.some(([groupName, definitions]) => {
      if (!areAllColumnMenuGroupsActive && !activeColumnMenuGroups.includes(groupName)) {
        return false;
      }
      return definitions.some((definition) => {
        if (normalizedParameterNameFilter.length === 0) {
          return true;
        }
        return definition.name.toLowerCase().includes(normalizedParameterNameFilter);
      });
    });
  }, [activeColumnMenuGroups, areAllColumnMenuGroupsActive, normalizedParameterNameFilter, parameterGroupEntries]);

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

  const parameterDefinitionMap = useMemo(() => {
    const lookup = new Map<string, ParameterDefinition>();
    for (const definition of parameterDefinitions) {
      lookup.set(definition.name, definition);
    }
    return lookup;
  }, [parameterDefinitions]);

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
        console.warn("samples-grid: column visibility initialized", {
          baseColumnCount: BASE_COLUMN_CONFIG.length,
          parameterDefinitionCount: parameterDefinitions.length,
          visibleParameterCount: Object.entries(next).filter(([key, value]) =>
            key.startsWith(PARAM_COLUMN_PREFIX) && value,
          ).length,
        });
        return next;
      }

      for (const key of nextKeys) {
        if (previous[key] !== next[key]) {
          console.warn("samples-grid: column visibility updated", {
            key,
            previousValue: previous[key],
            nextValue: next[key],
          });
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
      const matchesParameters = displayedParameterNames.some((name) => {
        const value = parameters[name];
        if (value == null) {
          return false;
        }
        return String(value).toLowerCase().includes(valueTerm);
      });

      if (matchesParameters) {
        return true;
      }

      return BASE_VALUE_FILTER_FIELDS.some((field) => {
        const value = sample[field];
        if (value == null) {
          return false;
        }
        return String(value).toLowerCase().includes(valueTerm);
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

  type ParameterEditSource = "optionSelect" | "keyboard" | "blur" | "valueSetter";

  type ApplyParameterCandidateResult =
    | { applied: true; displayValue: string }
    | {
        applied: false;
        displayValue: string;
        reason: "missingSample" | "empty" | "invalid" | "noChange";
      };

  interface ApplyParameterCandidateArgs {
    api: GridApi<SampleListItem>;
    rowNode: IRowNode<SampleListItem>;
    sample: SampleListItem | null | undefined;
    definition: ParameterDefinition;
    candidate: string;
    source: ParameterEditSource;
  }

  const isDev = process.env.NODE_ENV !== "production";

  const commitParameterEdit = useCallback(
    (sample: SampleListItem, parameterName: string, normalized: NormalizedParameterValue) => {
      const overrides = new Map<string, NormalizedParameterValue>([[parameterName, normalized]]);
      const assignments = buildAssignments(sample, parameterDefinitionMap, overrides);

      if (assignments.length === 0) {
        if (isDev) {
          console.warn("samples-grid: no assignments generated for edit", {
            sampleId: sample.sample_id,
            parameter: parameterName,
          });
        }
        return;
      }

      if (isDev) {
        console.info("samples-grid: committing parameter edit", {
          sampleId: sample.sample_id,
          parameter: parameterName,
          value: normalized.value,
          assignmentCount: assignments.length,
        });
      }

      mutateSampleParameters({
        sampleId: sample.sample_id,
        assignments,
      });
    },
    [isDev, mutateSampleParameters, parameterDefinitionMap],
  );

  const applyParameterCandidate = useCallback(
    ({ api, rowNode, sample, definition, candidate, source }: ApplyParameterCandidateArgs): ApplyParameterCandidateResult => {
      if (!sample) {
        if (isDev) {
          console.warn("samples-grid: edit rejected (missing sample)", {
            parameter: definition.name,
            source,
          });
        }
        return { applied: false, displayValue: "", reason: "missingSample" };
      }

      const trimmed = candidate.trim();
      const previousDisplay = sample.parameters?.[definition.name] ?? "";

      if (trimmed.length === 0) {
        if (isDev) {
          console.warn("samples-grid: edit rejected (empty value)", {
            sampleId: sample.sample_id,
            parameter: definition.name,
            source,
          });
        }
        return source === "valueSetter"
          ? { applied: false, displayValue: previousDisplay, reason: "empty" }
          : { applied: false, displayValue: previousDisplay, reason: "empty" };
      }

      const normalized = normalizeParameterValue(definition, trimmed, previousDisplay);

      if (!normalized) {
        if (isDev) {
          console.warn("samples-grid: edit rejected (failed normalization)", {
            sampleId: sample.sample_id,
            parameter: definition.name,
            source,
            candidate: trimmed,
            previous: previousDisplay,
          });
        }
        return { applied: false, displayValue: previousDisplay, reason: "invalid" };
      }

      if (normalized.displayValue === previousDisplay) {
        if (isDev) {
          console.info("samples-grid: edit skipped (no change)", {
            sampleId: sample.sample_id,
            parameter: definition.name,
            source,
          });
        }
        return source === "valueSetter"
          ? { applied: true, displayValue: previousDisplay }
          : { applied: false, displayValue: previousDisplay, reason: "noChange" };
      }

      const nextParameters = { ...(sample.parameters ?? {}) };

      if (normalized.displayValue === "") {
        delete nextParameters[definition.name];
      } else {
        nextParameters[definition.name] = normalized.displayValue;
      }

      sample.parameters = nextParameters;

      commitParameterEdit(sample, definition.name, normalized);

      if (isDev) {
        console.info("samples-grid: edit applied", {
          sampleId: sample.sample_id,
          parameter: definition.name,
          source,
        });
      }

      api.refreshCells({
        rowNodes: [rowNode],
        columns: [`${PARAM_COLUMN_PREFIX}${definition.name}`],
        force: true,
        suppressFlash: true,
      });

      return { applied: true, displayValue: normalized.displayValue };
    },
    [commitParameterEdit, isDev],
  );

  const parameterColumnDefs = useMemo<ColDef<SampleListItem>[]>(() => {
    if (parameterGroupEntries.length === 0) {
      return [];
    }

    const defs: ColDef<SampleListItem>[] = [];
    let definitionCount = 0;

    for (const [groupName, definitions] of parameterGroupEntries) {
      const passesGroupFilter = groupFilter === "all" || groupName === groupFilter;
      for (const definition of definitions) {
        definitionCount += 1;
        const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
        const fallbackVisible = hasValueByParameter.get(definition.name) ?? false;
        const explicitVisibility = columnVisibility[colId];
        const matchesNameFilter =
          normalizedParameterNameFilter.length === 0 ||
          definition.name.toLowerCase().includes(normalizedParameterNameFilter);
        const isVisible = (explicitVisibility ?? fallbackVisible) && passesGroupFilter && matchesNameFilter;
        defs.push({
          colId,
          headerName: definition.name,
          headerTooltip: definition.name,
          field: definition.name,
          hide: !isVisible,
          width: parameterColumnWidths.get(definition.name) ?? MIN_COLUMN_WIDTH,
          suppressSizeToFit: true,
          filter: "agTextColumnFilter",
          filterParams: createTextFilterParams(),
          editable: true,
          valueGetter: (params: ValueGetterParams<SampleListItem, string>) =>
            params.data?.parameters?.[definition.name] ?? "",
          cellEditor: "parameterValueEditor",
          cellEditorParams: (params: ICellEditorParams<SampleListItem>) => ({
            value: params.value,
            values: valuesByParameter.get(definition.name) ?? [],
            applyCandidate: (candidate: string, source: ParameterEditSource) =>
              applyParameterCandidate({
                api: params.api,
                rowNode: params.node,
                sample: params.data,
                definition,
                candidate,
                source,
              }),
          }),
          valueSetter: (event) => {
            const outcome = applyParameterCandidate({
              api: event.api,
              rowNode: event.node,
              sample: event.data,
              definition,
              candidate: String(event.newValue ?? ""),
              source: "valueSetter",
            });
            return outcome.applied;
          },
        });
      }
    }

    if (isDev) {
      console.info("samples-grid: parameter columns prepared", {
        definitionCount,
        columnCount: defs.length,
        columnGroups: parameterGroupEntries.length,
      });
    }

    return defs;
  }, [
    applyParameterCandidate,
    columnVisibility,
    groupFilter,
    hasValueByParameter,
    isDev,
    normalizedParameterNameFilter,
    parameterColumnWidths,
    parameterGroupEntries,
    valuesByParameter,
  ]);

  const fillerColumnDef = useMemo<ColDef<SampleListItem>>(
    () => ({
      colId: "__padding__",
      headerName: "",
      valueGetter: () => "",
      resizable: false,
      sortable: false,
      filter: false,
      editable: false,
      suppressMovable: true,
      width: 1,
      flex: 1,
      cellClass: "ag-filler-cell",
      headerClass: "ag-filler-header",
    }),
    [],
  );

  const computedColumnDefs = useMemo<ColDef<SampleListItem>[]>(
    () => [...baseColumnDefs, ...parameterColumnDefs, fillerColumnDef],
    [baseColumnDefs, fillerColumnDef, parameterColumnDefs],
  );

  useEffect(() => {
    if (!gridApiRef.current || !isGridReady) {
      return;
    }
    gridApiRef.current.setGridOption("columnDefs", computedColumnDefs);
  }, [computedColumnDefs, isGridReady]);

  useEffect(() => {
    if (!isGridReady || !gridContainerRef.current) {
      return;
    }
    const headerElement = gridContainerRef.current.querySelector<HTMLElement>(".ag-header");
    if (!headerElement) {
      return;
    }
    setHeaderHeight(headerElement.getBoundingClientRect().height);
  }, [computedColumnDefs, isGridReady]);

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
    setIsGridReady(true);
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

  const handleToggleAllParameterGroups = useCallback(() => {
    setColumnPickerSelection((previous) => {
      if (previous.mode === "all") {
        return { mode: "custom", selections: [] };
      }
      return { mode: "all", selections: [] };
    });
  }, []);

  const handleToggleColumnMenuGroupFilter = useCallback(
    (groupName: string) => {
      setColumnPickerSelection((previous) => {
        if (previous.mode === "all") {
          const nextSelections = allParameterGroupNames.filter((name) => name !== groupName);
          return { mode: "custom", selections: nextSelections };
        }

        if (previous.selections.includes(groupName)) {
          const nextSelections = previous.selections.filter((value) => value !== groupName);
          if (nextSelections.length === 0) {
            return { mode: "custom", selections: [] };
          }
          return { mode: "custom", selections: nextSelections };
        }

        const nextSelections = [...previous.selections, groupName].sort(
          (a, b) => allParameterGroupNames.indexOf(a) - allParameterGroupNames.indexOf(b),
        );

        if (nextSelections.length === allParameterGroupNames.length) {
          return { mode: "all", selections: [] };
        }

        return { mode: "custom", selections: nextSelections };
      });
    },
    [allParameterGroupNames],
  );

  const handleGroupDragStart = useCallback(
    (groupName: string) => (event: ReactDragEvent<HTMLButtonElement>) => {
      dragSourceGroupRef.current = groupName;
      dragActiveRef.current = true;
      setDraggingGroup(groupName);
      event.dataTransfer.effectAllowed = "move";
      if (typeof Image !== "undefined" && typeof event.dataTransfer.setDragImage === "function") {
        const dragImage = new Image();
        dragImage.src =
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        event.dataTransfer.setDragImage(dragImage, 0, 0);
      }
    },
    [],
  );

  const handleGroupDragOver = useCallback(
    (targetGroup: string) => (event: ReactDragEvent<HTMLButtonElement>) => {
      const sourceGroup = dragSourceGroupRef.current;
      if (!sourceGroup) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      if (sourceGroup === targetGroup) {
        return;
      }

      setGroupOrder((previous) => {
        const definitionSet = new Set(definitionGroupNames);
        if (!definitionSet.has(sourceGroup) || !definitionSet.has(targetGroup)) {
          return previous;
        }

        const ordered = previous.filter((name) => definitionSet.has(name));
        const sourceIndex = ordered.indexOf(sourceGroup);
        const targetIndex = ordered.indexOf(targetGroup);

        if (sourceIndex === -1 || targetIndex === -1) {
          return previous;
        }

  const nextOrdered = [...ordered];
  nextOrdered.splice(sourceIndex, 1);
  const insertIndex = Math.max(0, Math.min(targetIndex, nextOrdered.length));
  nextOrdered.splice(insertIndex, 0, sourceGroup);

        const untouched = previous.filter((name) => !definitionSet.has(name));
        const next = [...nextOrdered, ...untouched];

        if (next.length === previous.length && next.every((value, index) => value === previous[index])) {
          return previous;
        }

        return next;
      });
    },
    [definitionGroupNames],
  );

  const handleGroupDrop = useCallback((event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragSourceGroupRef.current = null;
    setDraggingGroup(null);
    setTimeout(() => {
      dragActiveRef.current = false;
    }, 0);
  }, []);

  const handleGroupDragEnd = useCallback(() => {
    dragSourceGroupRef.current = null;
    setDraggingGroup(null);
    setTimeout(() => {
      dragActiveRef.current = false;
    }, 0);
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

  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<SampleListItem>) => {
    const rawColId = event.colDef.colId ?? event.colDef.field ?? "";

    console.warn("samples-grid: cellValueChanged fired", {
      colId: rawColId,
      field: event.colDef.field,
      sampleId: event.data?.sample_id ?? null,
      previousValue: event.oldValue,
      candidateNextValue: event.newValue,
    });

    if (!rawColId.startsWith(PARAM_COLUMN_PREFIX)) {
      console.warn("samples-grid: ignoring edit for non-parameter column", {
        colId: rawColId,
      });
      return;
    }

    const parameterName = rawColId.slice(PARAM_COLUMN_PREFIX.length);

    console.warn("samples-grid: parameter edit routed to valueSetter", {
      parameter: parameterName,
    });
  }, []);

  const parameterGroupSelectDisabled = parameterDefinitions.length === 0 && areParameterDefinitionsLoading;

  const columnsReady =
    !areParameterDefinitionsLoading &&
    (parameterDefinitions.length === 0 || parameterColumnDefs.length > 0);
  const showFullOverlay = !isGridReady || !columnsReady;
  const filtersActive =
    parameterNameFilter.trim().length > 0 ||
    parameterValueFilter.trim().length > 0 ||
    groupFilter !== "all";
  const rowOverlayMessage = isLoading
    ? "Loading..."
    : samples.length === 0
      ? "No samples available."
      : filtersActive
        ? "No samples match the current filters."
        : "No rows to show.";
  const showRowOverlay = !showFullOverlay && filteredSamples.length === 0;
  const overlayHeaderHeight = headerHeight > 0 ? headerHeight : 56;

  return (
    <main className="flex h-screen min-h-screen flex-col gap-6 bg-background p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Samples</h1>
          <p className="text-sm text-subtle">
            Browse the local LabFrame sample catalog backed by the FastAPI service.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button
              type="button"
              className={`flex h-9 items-center gap-2 rounded border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isColumnMenuOpen
                  ? "border-border/70 bg-muted/60 text-foreground hover:bg-muted/70"
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

    <section className="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-muted/30 px-4 py-3">
          <div className="text-sm">
            <span className="sr-only">Parameter group</span>
            <ParameterGroupFilterControl
              groups={parameterGroups}
              value={groupFilter}
              onChange={setGroupFilter}
              disabled={parameterGroupSelectDisabled}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Parameter name</span>
            <input
              type="text"
              className="h-9 w-48 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              placeholder="Filter parameter name"
              value={parameterNameFilter}
              onChange={(event) => setParameterNameFilter(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Parameter value</span>
            <input
              type="text"
              className="h-9 w-48 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
          <div ref={gridContainerRef} className="relative h-full w-full">
            <AgGridReact<SampleListItem>
              key={isMounted ? (isDark ? "dark" : "light") : "light"}
              rowData={filteredSamples}
              columnDefs={computedColumnDefs}
              defaultColDef={defaultColDef}
              animateRows
              suppressNoRowsOverlay
              singleClickEdit
              stopEditingWhenCellsLoseFocus
              className={`${gridClassName} ${isColumnMenuOpen ? "pointer-events-none" : ""}`}
              components={gridComponents}
              theme="legacy"
              tooltipShowDelay={500}
              rowSelection={{ mode: "multiRow" }}
              onGridReady={handleGridReady}
              onFirstDataRendered={handleFirstDataRendered}
              onCellValueChanged={handleCellValueChanged}
            />
            {showFullOverlay ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/90 text-sm font-medium text-foreground shadow-inner">
                Loading...
              </div>
            ) : null}
            {!showFullOverlay && showRowOverlay ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center bg-card/80 text-sm text-foreground"
                style={{ top: overlayHeaderHeight }}
              >
                {rowOverlayMessage}
              </div>
            ) : null}
          </div>
        </div>

        {isColumnMenuOpen ? (
            <div className="absolute inset-0 z-20 flex max-w-full flex-col overflow-hidden bg-popover">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Column visibility</h2>
                <p className="text-xs text-subtle">
                  Toggle core fields and parameter groups. Changes apply immediately.
                </p>
              </div>
              <button
                type="button"
                  className="rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={handleToggleColumnMenu}
              >
                Done
              </button>
            </header>
              <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 py-4 md:flex-row">
                <section className="w-full max-w-sm shrink-0 space-y-3 overflow-y-auto pr-2 md:w-64 md:max-w-xs md:border-r md:border-border/60 md:pr-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
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
                            className="column-toggle-checkbox h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            checked={isChecked}
                            onChange={(event) =>
                              handleColumnVisibilityChange(config.id, event.target.checked)
                            }
                            disabled={config.lockToggle}
                          />
                          <span className="flex flex-1 items-center justify-between gap-2 text-foreground">
                            {config.label}
                            {config.lockToggle ? (
                              <span className="text-xs font-medium text-subtle">
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
                  <p
                    className="text-xs font-semibold uppercase tracking-wide text-subtle"
                  >
                    Parameter groups
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        areAllColumnMenuGroupsActive
                          ? "border-border bg-muted/60 text-foreground hover:bg-muted/70"
                          : "border-border/60 text-foreground opacity-60 hover:opacity-80"
                      }`}
                      onClick={handleToggleAllParameterGroups}
                    >
                      All groups
                    </button>
                    {parameterGroupEntries.map(([groupName]) => {
                      const isSelected =
                        areAllColumnMenuGroupsActive || activeColumnMenuGroups.includes(groupName);
                      const isDraggable = parameterGroupEntries.length > 1;
                      const isDragging = draggingGroup === groupName;
                      const baseClasses =
                        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
                      const activeClasses = "border-border bg-muted/50 text-foreground hover:bg-muted/60";
                      const inactiveClasses =
                        "border-border/60 text-foreground opacity-60 hover:opacity-80";
                      const draggingClasses = "border-accent bg-accent text-foreground opacity-100 hover:bg-accent/90";
                      const stateClasses = isDragging
                        ? draggingClasses
                        : isSelected
                          ? activeClasses
                          : inactiveClasses;
                      return (
                        <button
                          key={groupName}
                          type="button"
                          className={`${baseClasses} ${stateClasses} ${isDraggable ? "cursor-move" : ""}`}
                          draggable={isDraggable}
                          onDragStart={handleGroupDragStart(groupName)}
                          onDragOver={handleGroupDragOver(groupName)}
                          onDragEnter={handleGroupDragOver(groupName)}
                          onDrop={handleGroupDrop}
                          onDragEnd={handleGroupDragEnd}
                          aria-label={`Toggle ${groupName} group`}
                          onClick={(event) => {
                            if (dragActiveRef.current) {
                              event.preventDefault();
                              return;
                            }
                            handleToggleColumnMenuGroupFilter(groupName);
                          }}
                        >
                          {groupName}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {parameterGroupEntries.length === 0 ? (
                  <p className="mt-4 text-xs text-subtle">
                    No parameter metadata available.
                  </p>
                ) : columnPickerSelection.mode === "custom" && columnPickerSelection.selections.length === 0 ? (
                  <p className="mt-4 text-xs text-subtle">
                    Select one or more parameter groups to display matching parameters.
                  </p>
                ) : !hasVisibleParameterMatches ? (
                  <p className="mt-4 text-xs text-subtle">
                    No parameters match the current group or name filters.
                  </p>
                ) : (
                  <div className="mt-4 h-full w-full overflow-y-auto overflow-x-hidden pr-2">
                    <div className="columns-[14rem] space-y-4 sm:columns-[16rem] lg:columns-[18rem] [column-fill:balance]">
                      {parameterGroupEntries
                      .filter(([groupName]) =>
                        areAllColumnMenuGroupsActive
                          ? true
                          : activeColumnMenuGroups.includes(groupName),
                      )
                      .map(([groupName, definitions]) => {
                        const visibleDefinitions = definitions.filter((definition) => {
                          if (normalizedParameterNameFilter.length === 0) {
                            return true;
                          }
                          return definition.name.toLowerCase().includes(normalizedParameterNameFilter);
                        });

                        if (visibleDefinitions.length === 0) {
                          return null;
                        }

                        return (
                          <section
                            key={groupName}
                            className="w-full break-inside-avoid rounded-lg border border-border/60 bg-muted/20 p-3"
                          >
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">
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
                                        className="column-toggle-checkbox h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        checked={isChecked}
                                        onChange={(event) =>
                                          handleColumnVisibilityChange(colId, event.target.checked)
                                        }
                                      />
                                      <span className="flex flex-col text-foreground">
                                        <span>{definition.name}</span>
                                        {metaText ? (
                                          <span className="text-xs text-subtle">
                                            {metaText}
                                          </span>
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
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
