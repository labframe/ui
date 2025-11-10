"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type {
  CellKeyDownEvent,
  CellMouseDownEvent,
  ColDef,
  ColumnResizedEvent,
  FirstDataRenderedEvent,
  GridApi,
  GridReadyEvent,
  ICellEditorParams,
  ICellEditorComp,
  ICellRendererParams,
  IRowNode,
  SelectionChangedEvent,
  ValueGetterParams,
  ValueSetterParams,
} from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Filter, X, MoreVertical, Undo2, Redo2, Trash2, Plus, FileText } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useThemePreference } from "@/components/theme/theme-provider";
import { ProjectSelector } from "@/components/project/project-selector";
import { SettingsButton } from "@/components/settings/settings-button";
import { SettingsOverlay } from "@/components/settings/settings-overlay";
import type { ParameterDefinition, SampleListItem, SampleParameterAssignment, ParameterValueHistoryItem } from "@/lib/api";
import {
  useParameterDefinitions,
  useSamplesQuery,
  useUpdateSampleParameters,
  useCreateSample,
  useDeleteSample,
  useParameterHistory,
  useLatestParameterValue,
  useSampleParameterValues,
  useAllParameterUniqueValues,
} from "@/lib/hooks/use-samples";
import { useDatabaseChanges } from "@/lib/hooks/use-database-changes";
import { useHistory } from "@/lib/hooks/use-history";
import {
  ParameterValueEditor,
  CELL_HORIZONTAL_PADDING_PX,
  sortParameterValues,
} from "@/components/samples/parameter-value-editor";

// Type declaration for window property
declare global {
  interface Window {
    __LABFRAME_DISABLE_COLUMN_WIDTH_OVERRIDES__?: boolean;
  }
}

const PARAM_COLUMN_PREFIX = "param::";

const TEXT_FILTER_OPTIONS = [
  "contains",
  "notContains",
  "equals",
  "notEqual",
  "startsWith",
  "endsWith",
] as const;

const TEXT_FILTER_PARAMS = Object.freeze({
  filterOptions: TEXT_FILTER_OPTIONS,
  defaultOption: "contains",
  caseSensitive: false,
  trimInput: true,
  debounceMs: 150,
  textFormatter: (value?: string | null) => String(value ?? "").toLowerCase(),
});

function splitDetailMessage(detail: string): [string, string | null] {
  const colonIndex = detail.indexOf(":");
  if (colonIndex === -1) {
    return [detail, null];
  }
  const head = detail.slice(0, colonIndex + 1).trimEnd();
  const tail = detail.slice(colonIndex + 1).trimStart();
  return [head, tail.length > 0 ? tail : null];
}

type ToastVariant = "info" | "error";

interface ToastMessage {
  id: string;
  summary: string;
  detail?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastInput {
  summary: string;
  detail?: string;
  variant?: ToastVariant;
  duration?: number;
}

const DEFAULT_TOAST_DURATION_MS = 5000;

const isDev = process.env.NODE_ENV !== "production";

type ColumnDescriptor = {
  getColId?: () => string | null;
  getColDef?: () => ColDef<SampleListItem> | undefined;
  colId?: string | null;
};

type ColumnApiLike = {
  getAllColumns?: () => ColumnDescriptor[];
  getColumn: (key: string) => ColumnDescriptor | null | undefined;
  setColumnWidth: (column: ColumnDescriptor | string, width: number, source?: unknown, finished?: boolean) => void;
  setColumnVisible: (key: string, visible: boolean) => void;
};

interface BaseColumnConfig {
  id: string;
  label: string;
  defaultVisible?: boolean;
  lockToggle?: boolean;
  colDef: ColDef<SampleListItem>;
}

type TextFilterInputs = Array<string | null | undefined>;

type NumericTextFilterPredicate = (inputs: TextFilterInputs, value: unknown) => boolean;

interface NumericTextFilterOption {
  displayKey: string;
  displayName: string;
  numberOfInputs?: number;
  predicate: NumericTextFilterPredicate;
}

const INTEGER_EPSILON = 1e-9;

const floatingNumberFormatter = typeof Intl !== "undefined"
  ? new Intl.NumberFormat(undefined, {
      useGrouping: false,
      maximumFractionDigits: 6,
    })
  : null;

function coerceNumeric(candidate: unknown): number | null {
  if (candidate == null) {
    return null;
  }
  if (typeof candidate === "number") {
    return Number.isFinite(candidate) ? candidate : null;
  }
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumericDisplay(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  if (floatingNumberFormatter) {
    return floatingNumberFormatter.format(value);
  }
  return value.toString();
}

const NUMBER_TEXT_FILTER_OPTIONS: ReadonlyArray<NumericTextFilterOption> = [
  {
    displayKey: "numericEquals",
    displayName: "Equals",
    predicate: (inputs, rawValue) => {
      const [rawFilter] = inputs;
      const filterValue = coerceNumeric(rawFilter);
      const cellValue = coerceNumeric(rawValue);
      if (filterValue == null || cellValue == null) {
        return false;
      }
      return Math.abs(cellValue - filterValue) < INTEGER_EPSILON;
    },
  },
  {
    displayKey: "numericNotEqual",
    displayName: "Does not equal",
    predicate: (inputs, rawValue) => {
      const [rawFilter] = inputs;
      const filterValue = coerceNumeric(rawFilter);
      const cellValue = coerceNumeric(rawValue);
      if (filterValue == null || cellValue == null) {
        return false;
      }
      return Math.abs(cellValue - filterValue) >= INTEGER_EPSILON;
    },
  },
  {
    displayKey: "numericGreaterThan",
    displayName: "Greater than",
    predicate: (inputs, rawValue) => {
      const [rawFilter] = inputs;
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
    predicate: (inputs, rawValue) => {
      const [rawFilter] = inputs;
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
    predicate: (inputs, rawValue) => {
      const [rawFilter] = inputs;
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
    predicate: (inputs, rawValue) => {
      const [rawFilter] = inputs;
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
    predicate: (inputs, rawValue) => {
      const [rawFrom, rawTo] = inputs;
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

const createNumberTextFilterParams = () => ({
  filterOptions: NUMBER_TEXT_FILTER_OPTIONS,
  defaultOption: "contains",
  caseSensitive: false,
  debounceMs: 150,
});

const cloneTextFilterParams = () => ({
  ...TEXT_FILTER_PARAMS,
});

type NormalizedParameterValue = {
  value: string | number | boolean;
  displayValue: string;
  unitSymbol?: string | null;
};

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
  rowNode: IRowNode<SampleListItem> | null;
  sample: SampleListItem | null | undefined;
  definition: ParameterDefinition;
  candidate: string;
  source: ParameterEditSource;
}

function normalizeParameterValue(
  definition: ParameterDefinition | undefined,
  nextValue: string,
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
  return normalizeParameterValue(definition, trimmed);
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
    id: "__selection__",
    label: "Select",
    lockToggle: true,
    colDef: {
      colId: "__selection__",
      headerName: "",
      checkboxSelection: true,
      headerCheckboxSelection: true,
  headerCheckboxSelectionFilteredOnly: true,
      sortable: false,
      filter: false,
      resizable: false,
      suppressSizeToFit: true,
  menuTabs: [],
      suppressMovable: true,
      suppressNavigable: true,
      pinned: "left",
      lockPosition: true,
      width: 48,
      minWidth: 44,
      maxWidth: 56,
      cellClass: "ag-selection-checkbox",
      headerClass: "ag-selection-checkbox",
    },
  },
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
      suppressMovable: true,
      cellClass: "text-right tabular-nums",
    },
  },
  {
    id: "code",
    label: "Code",
    colDef: {
      colId: "code",
      field: "code",
      headerName: "Code",
      cellClass: "text-left",
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
      cellClass: "text-left",
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
      cellClass: "text-left",
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
      cellClass: "text-left",
    },
  },
  {
    id: "sequence_number",
    label: "Seq",
    colDef: {
      colId: "sequence_number",
      field: "sequence_number",
      headerName: "Seq",
      maxWidth: 96,
      filter: "agTextColumnFilter",
      filterParams: createNumberTextFilterParams(),
      flex: 0,
      cellClass: "text-right tabular-nums",
      minWidth: 72,
    },
  },
];

const BASE_VALUE_FILTER_FIELDS: ReadonlyArray<keyof SampleListItem> = BASE_COLUMN_CONFIG
  .map((config) => (typeof config.colDef.field === "string" ? config.colDef.field : null))
  .filter((field): field is keyof SampleListItem => field != null);
const CHARACTER_PIXEL_WIDTH = 9;
const COLUMN_PADDING_PX = 28;
const AUTOSIZE_PADDING_ADJUSTMENT_PX = 19; // Amount to subtract from AG Grid's autosize result
const EXTRA_CHAR_PADDING = 4;
const MIN_COLUMN_WIDTH = 56;
const MAX_PARAMETER_COLUMN_WIDTH = 360;

/**
 * Measures the actual width of text in pixels using a temporary DOM element.
 * Matches AG Grid cell font styles exactly.
 */
function measureTextWidth(text: string): number {
  if (typeof window === "undefined" || !text) {
    return 0;
  }
  
  // Try to find an existing AG Grid cell to get exact computed styles
  let referenceCell: HTMLElement | null = null;
  try {
    const grid = document.querySelector('.ag-root-wrapper');
    if (grid) {
      const firstCell = grid.querySelector('.ag-cell');
      if (firstCell instanceof HTMLElement) {
        referenceCell = firstCell;
      }
    }
  } catch {
    // Ignore if grid not available
  }
  
  // Create measurement element
  const measureEl = document.createElement("span");
  measureEl.style.visibility = "hidden";
  measureEl.style.position = "absolute";
  measureEl.style.top = "-9999px";
  measureEl.style.left = "-9999px";
  measureEl.style.whiteSpace = "nowrap";
  measureEl.textContent = text;
  
  // Apply styles from reference cell if available, otherwise use defaults
  if (referenceCell) {
    const computed = window.getComputedStyle(referenceCell);
    measureEl.style.fontSize = computed.fontSize;
    measureEl.style.fontFamily = computed.fontFamily;
    measureEl.style.fontWeight = computed.fontWeight;
    measureEl.style.fontStyle = computed.fontStyle;
    measureEl.style.letterSpacing = computed.letterSpacing;
    measureEl.style.textTransform = computed.textTransform;
  } else {
    // Fallback to Tailwind text-sm defaults (0.875rem = 14px)
    measureEl.style.fontSize = "0.875rem";
    measureEl.style.fontFamily = "var(--font-geist-sans, system-ui)";
    measureEl.style.fontWeight = "400";
  }
  
  document.body.appendChild(measureEl);
  
  const width = Math.ceil(measureEl.offsetWidth);
  
  document.body.removeChild(measureEl);
  
  return width;
}
const DEFAULT_PARAMETER_GROUP_NAME = "Ungrouped";
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
  DEFAULT_PARAMETER_GROUP_NAME,
] as const;

const COLUMN_WIDTH_STORAGE_KEY = "samples-grid:column-widths";
const PARAMETER_VALUE_EMPTY_DISPLAY = "-";

function loadPersistedColumnWidths() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) {
        continue;
      }
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(numeric));
      result[key] = width;
    }
    return result;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("samples-grid: failed to load column widths", error);
    }
    return null;
  }
}

function persistColumnWidths(widths: Record<string, number>) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const entries = Object.entries(widths).filter(([, value]) => Number.isFinite(value));
    if (entries.length === 0) {
      window.localStorage.removeItem(COLUMN_WIDTH_STORAGE_KEY);
      return;
    }
    const payload: Record<string, number> = {};
    for (const [key, value] of entries) {
      payload[key] = Math.max(MIN_COLUMN_WIDTH, Math.round(value));
    }
    window.localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("samples-grid: failed to persist column widths", error);
    }
  }
}

function resolveParameterGroupName(definition: ParameterDefinition): string {
  const raw = typeof definition.group_name === "string" ? definition.group_name.trim() : "";
  return raw.length > 0 ? raw : DEFAULT_PARAMETER_GROUP_NAME;
}

type ColumnPickerSelectionState = {
  mode: "all" | "custom";
  selections: string[];
};

type ParameterValueCellRendererParams = ICellRendererParams<SampleListItem, string> & {
  optionValues?: string[];
  textAlign?: "left" | "right";
  useTabularNumbers?: boolean;
};

// Create a standalone dropdown for right-click that doesn't require edit mode
const createStandaloneDropdown = (
  cellElement: HTMLElement,
  options: string[],
  currentValue: string,
  onSelect: (option: string) => void
): { close: () => void } => {
  // Create dropdown element
  const dropdown = document.createElement("ul");
  dropdown.role = "listbox";
  dropdown.className = "fixed z-50 max-h-60 overflow-auto rounded-md border border-border/60 py-1 text-sm shadow-lg custom-popup-bg";
  
  // Position dropdown below the cell
  const cellRect = cellElement.getBoundingClientRect();
  dropdown.style.left = `${cellRect.left}px`;
  dropdown.style.top = `${cellRect.bottom + 4}px`;
  dropdown.style.minWidth = `${cellRect.width}px`;
  
  // Add options
  const availableOptions = options.filter((opt) => opt.trim() !== currentValue.trim());
  availableOptions.forEach((option) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.role = "option";
    // Match the cell text font weight exactly - get computed style from a cell if available
    // Font weight can be "normal", "400", or other values - normalize to numeric value
    let fontWeight = "400"; // Default regular weight
    try {
      const grid = document.querySelector('.ag-root-wrapper');
      if (grid) {
        const cell = grid.querySelector('.parameter-value-text');
        if (cell) {
          const style = window.getComputedStyle(cell);
          const computedWeight = style.fontWeight;
          if (computedWeight) {
            // Normalize font weight: "normal" = 400, "bold" = 700, or keep numeric value
            if (computedWeight === "normal") {
              fontWeight = "400";
            } else if (computedWeight === "bold") {
              fontWeight = "700";
            } else {
              // Use numeric value directly (e.g., "400", "500", "600")
              fontWeight = computedWeight;
            }
          }
        }
      }
    } catch {
      // Ignore if unable to get computed style
    }
    
    button.className = "flex w-full items-center justify-start gap-2 py-1.5 px-3.5 text-left text-foreground transition-colors hover:bg-muted/80";
    // Match all font properties from cell - use fixed font-weight to ensure it matches
    try {
      const grid = document.querySelector('.ag-root-wrapper');
      if (grid) {
        const cell = grid.querySelector('.parameter-value-text');
        if (cell) {
          const style = window.getComputedStyle(cell);
          button.style.fontFamily = style.fontFamily;
          button.style.fontSize = style.fontSize;
          button.style.letterSpacing = style.letterSpacing;
          // Use font-weight 550 to make text more visible
          // Note: Some fonts don't support 550, so use 500 instead (which is standard medium weight)
          button.style.setProperty('font-weight', '500', 'important');
        }
      }
    } catch {
      // If unable to get computed style, use fixed weight
      button.style.setProperty('font-weight', '500', 'important');
    }
    button.textContent = option;
    button.onclick = () => {
      onSelect(option);
      closeDropdown();
    };
    li.appendChild(button);
    dropdown.appendChild(li);
  });
  
  // Close dropdown function
  const closeDropdown = () => {
    document.body.removeChild(dropdown);
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleEscape);
  };
  
  // Close on outside click
  const handleClickOutside = (event: MouseEvent) => {
    if (!dropdown.contains(event.target as Node) && !cellElement.contains(event.target as Node)) {
      closeDropdown();
    }
  };
  
  // Close on Escape
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeDropdown();
    }
  };
  
  document.body.appendChild(dropdown);
  document.addEventListener("mousedown", handleClickOutside);
  document.addEventListener("keydown", handleEscape);
  
  return { close: closeDropdown };
};

const openDropdownForCell = (api: GridApi, rowIndex: number | undefined, colKey: string | null | undefined) => {
  if (rowIndex == null || !colKey || typeof window === "undefined") {
    return;
  }

  // Normal edit mode (e.g., from keyboard)
  api.startEditingCell({ rowIndex, colKey });

  // Wait for editor to be ready with exponential backoff
  let attempts = 0;
  const maxAttempts = 10;
  const delay = 50;

  const tryOpenDropdown = () => {
    attempts++;
    const instances = api.getCellEditorInstances();
    const editor = instances[0] as (ICellEditorComp & { openOptions?: () => void }) | undefined;
    
    if (editor?.openOptions) {
      // Editor is ready, open dropdown
      editor.openOptions();
      return true;
    }
    
    if (attempts >= maxAttempts) {
      // Give up after max attempts
      return false;
    }
    
    // Try again with exponential backoff
    setTimeout(tryOpenDropdown, delay * Math.min(attempts, 4));
    return false;
  };

  // Start trying after a short delay to let AG Grid initialize the editor
  setTimeout(tryOpenDropdown, 10);
};

const ParameterValueCellRenderer = (params: ParameterValueCellRendererParams) => {
  const rawValue = params.value ?? "";
  const displayValue = rawValue.length > 0 ? rawValue : PARAMETER_VALUE_EMPTY_DISPLAY;
  const optionValues = params.optionValues ?? [];
  const textAlign = params.textAlign ?? "left";
  const useTabularNumbers = params.useTabularNumbers ?? false;
  const hasAlternateOptions = optionValues.some((value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    return trimmed !== rawValue.trim();
  });

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!hasAlternateOptions) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    // Get cell element for positioning
    const cellElement = event.currentTarget.closest('.ag-cell');
    if (!(cellElement instanceof HTMLElement)) {
      return;
    }

    // Create standalone dropdown without entering edit mode
    createStandaloneDropdown(cellElement, optionValues, rawValue, (option: string) => {
      // Apply the selected value using AG Grid's valueSetter directly
    const rowIndex = params.node?.rowIndex;
    const colKey = params.column?.getId?.() ?? params.column?.getColId?.();
      const node = params.node;
      const column = params.column;
      
      if (rowIndex != null && colKey && node && column) {
        // Get the column definition's valueSetter
        const colDef = column.getColDef();
        const valueSetter = colDef?.valueSetter;
        
        if (valueSetter && typeof valueSetter === "function") {
          // Call valueSetter directly to set the value without entering edit mode
          const result = valueSetter({
            api: params.api,
            column: column,
            colDef: colDef,
            data: params.data,
            node: node,
            oldValue: params.value ?? "",
            newValue: option,
          } as ValueSetterParams<SampleListItem>);
          
          // Refresh the cell to show the new value
          params.api.refreshCells({ rowNodes: [node], columns: [colKey] });
        }
      }
    });
  };

  return (
    <div
      className="parameter-value-cell group relative flex h-full w-full items-center"
      onContextMenu={handleContextMenu}
    >
      <span
        className="parameter-value-text min-w-0 flex-1 whitespace-nowrap text-sm text-foreground"
        style={{ 
          paddingLeft: `${CELL_HORIZONTAL_PADDING_PX}px`,
          paddingRight: `${CELL_HORIZONTAL_PADDING_PX}px`,
          textAlign: textAlign === "right" ? "right" : "left"
        }}
      >
        {displayValue}
      </span>
    </div>
  );
};


const INVALID_OPTION_MESSAGE_PATTERN = /Value is not part of the allowed options/i;

function resolveParameterEditToast(error: unknown, parameterLabel?: string): { summary: string; detail: string } {
  const fallbackLabel = parameterLabel ? `parameter "${parameterLabel}"` : "this parameter";
  const fallbackSummary = `Could not update ${fallbackLabel}.`;

  const coerceMessage = (value: unknown): string | null => {
    if (value instanceof Error) {
      return value.message ?? null;
    }
    if (typeof value === "string") {
      return value;
    }
    return null;
  };

  const rawMessage = coerceMessage(error);
  if (rawMessage && INVALID_OPTION_MESSAGE_PATTERN.test(rawMessage)) {
    const summary = "Value is not part of the allowed options for this parameter.";
    return { summary, detail: rawMessage };
  }

  const detail = rawMessage ?? fallbackSummary;
  return { summary: detail, detail };
}

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
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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
        ref={buttonRef}
        type="button"
        className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <ChevronDown className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
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

// Helper function to format parameter value from history item
function formatParameterHistoryValue(item: ParameterValueHistoryItem): string {
  let value = "";
  if (item.value_text !== undefined && item.value_text !== null) {
    value = String(item.value_text);
  } else if (item.value_num !== undefined && item.value_num !== null) {
    value = String(item.value_num);
  } else if (item.value_bool !== undefined && item.value_bool !== null) {
    value = item.value_bool ? "true" : "false";
  } else if (item.value_date !== undefined && item.value_date !== null) {
    value = item.value_date;
  }
  
  if (item.unit_symbol) {
    value = `${value} ${item.unit_symbol}`;
  }
  
  return value;
}

// Helper function to get all units from parameter history
function extractUnitsFromHistory(history: ParameterValueHistoryItem[]): string[] {
  const units = new Set<string>();
  for (const item of history) {
    if (item.unit_symbol) {
      units.add(item.unit_symbol);
    }
  }
  return Array.from(units).sort();
}

interface DetailsOverlayProps {
  gridApi: GridApi<SampleListItem> | null;
  samples: SampleListItem[];
  parameterDefinitions: ParameterDefinition[];
  parameterGroupEntries: ReadonlyArray<readonly [string, ParameterDefinition[]]>;
  parameterDefinitionMap: Map<string, ParameterDefinition>;
  onClose: () => void;
  onUpdateParameters: (
    sample: SampleListItem,
    parameterName: string,
    normalized: NormalizedParameterValue,
  ) => void;
  normalizeParameterValue: (
    definition: ParameterDefinition | undefined,
    nextValue: string,
  ) => NormalizedParameterValue | null;
}

function DetailsOverlay({
  gridApi,
  samples,
  parameterDefinitions,
  parameterGroupEntries,
  parameterDefinitionMap,
  onClose,
  onUpdateParameters,
  normalizeParameterValue,
}: DetailsOverlayProps) {
  const [selectedSamples, setSelectedSamples] = useState<SampleListItem[]>([]);
  const [showAllParameters, setShowAllParameters] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("labframe_details_show_all");
    return stored === "true";
  });
  const [editingValues, setEditingValues] = useState<Map<string, string>>(new Map());
  const [newParameterGroup, setNewParameterGroup] = useState<string>("");
  const [newParameterName, setNewParameterName] = useState<string>("");
  const [newParameterValue, setNewParameterValue] = useState<string>("");
  const [newParameterType, setNewParameterType] = useState<string>("TEXT");
  const [newParameterUnit, setNewParameterUnit] = useState<string>("");
  const [isValuePrefilled, setIsValuePrefilled] = useState(false);
  
  // Store assigned parameters per sample (from API)
  const [assignedParametersBySample, setAssignedParametersBySample] = useState<Map<number, Set<string>>>(new Map());
  
  // Get latest parameter value for prefilling
  const latestValueQuery = useLatestParameterValue(newParameterName);
  
  // Get parameter history for value dropdown
  const parameterHistoryQuery = useParameterHistory(newParameterName);

  // Get selected samples from grid
  useEffect(() => {
    if (!gridApi) return;
    const updateSelection = () => {
      const selected = gridApi.getSelectedRows();
      setSelectedSamples(selected);
    };
    updateSelection();
    // Listen for selection changes
    const handleSelectionChanged = () => {
      updateSelection();
    };
    gridApi.addEventListener('selectionChanged', handleSelectionChanged);
    return () => {
      gridApi.removeEventListener('selectionChanged', handleSelectionChanged);
    };
  }, [gridApi]);

  // Persist showAllParameters preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("labframe_details_show_all", String(showAllParameters));
  }, [showAllParameters]);

  // Fetch assigned parameters for each selected sample (max 5 samples for hooks)
  const query1 = useSampleParameterValues(selectedSamples[0]?.sample_id ?? null);
  const query2 = useSampleParameterValues(selectedSamples[1]?.sample_id ?? null);
  const query3 = useSampleParameterValues(selectedSamples[2]?.sample_id ?? null);
  const query4 = useSampleParameterValues(selectedSamples[3]?.sample_id ?? null);
  const query5 = useSampleParameterValues(selectedSamples[4]?.sample_id ?? null);
  
  const allQueries = [query1, query2, query3, query4, query5];
  
  // Update assigned parameters map when queries complete
  useEffect(() => {
    const newMap = new Map<number, Set<string>>();
    allQueries.forEach((query, index) => {
      if (query.data && selectedSamples[index]) {
        const assignedNames = new Set(query.data.map(p => p.name));
        newMap.set(selectedSamples[index].sample_id, assignedNames);
      }
    });
    setAssignedParametersBySample(newMap);
  }, [query1.data, query2.data, query3.data, query4.data, query5.data, selectedSamples]);

  // Get all unique parameter groups
  const allGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const definition of parameterDefinitions) {
      const groupName = resolveParameterGroupName(definition);
      groups.add(groupName);
    }
    return Array.from(groups).sort();
  }, [parameterDefinitions]);

  // Get parameter names for selected group (excluding already assigned to selected samples)
  const parameterNamesForGroup = useMemo(() => {
    if (!newParameterGroup) return [];
    const groupDefs = parameterGroupEntries.find(([name]) => name === newParameterGroup)?.[1] ?? [];
    const assignedToSamples = new Set<string>();
    selectedSamples.forEach(sample => {
      const assigned = assignedParametersBySample.get(sample.sample_id);
      if (assigned) {
        assigned.forEach(name => assignedToSamples.add(name));
      }
    });
    return groupDefs
      .map((def) => def.name)
      .filter(name => !assignedToSamples.has(name))
      .sort();
  }, [newParameterGroup, parameterGroupEntries, selectedSamples, assignedParametersBySample]);

  // Get all unique units and types from parameter history and samples
  const allUnits = useMemo(() => {
    const units = new Set<string>();
    // From parameter history
    if (parameterHistoryQuery.data) {
      for (const item of parameterHistoryQuery.data) {
        if (item.unit_symbol) {
          units.add(item.unit_symbol);
        }
      }
    }
    // From samples (extract from display values)
    for (const sample of samples) {
      for (const value of Object.values(sample.parameters ?? {})) {
        const match = value.match(/\s+([a-zA-Z%°µ]+)$/);
        if (match) {
          units.add(match[1]);
        }
      }
    }
    return Array.from(units).sort();
  }, [parameterHistoryQuery.data, samples]);

  // Get all types (including units for numeric types)
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    // Base types
    types.add("Text");
    types.add("Integer");
    types.add("Real");
    types.add("Date (ISO format)");
    // Add units as types for numeric parameters
    if (newParameterType === "INTEGER" || newParameterType === "REAL") {
      for (const unit of allUnits) {
        types.add(`${newParameterType === "INTEGER" ? "Integer" : "Real"} (${unit})`);
      }
    }
    return Array.from(types).sort();
  }, [newParameterType, allUnits]);

  // Get all parameters to display (assigned or all if showAllParameters is true)
  const getAllParametersToDisplay = useCallback(() => {
    const paramsToShow = new Map<string, ParameterDefinition>();
    
    if (showAllParameters) {
      // Show all parameters from definitions
      for (const definition of parameterDefinitions) {
        paramsToShow.set(definition.name, definition);
      }
    } else {
      // Show only assigned parameters
      selectedSamples.forEach(sample => {
        const assigned = assignedParametersBySample.get(sample.sample_id);
        if (assigned) {
          assigned.forEach(name => {
            const definition = parameterDefinitionMap.get(name);
            if (definition && !paramsToShow.has(name)) {
              paramsToShow.set(name, definition);
            }
          });
        }
      });
    }
    
    return paramsToShow;
  }, [showAllParameters, selectedSamples, assignedParametersBySample, parameterDefinitions, parameterDefinitionMap]);
  
  // Get parameters grouped by group, with values for each sample
  const getParametersByGroupWithValues = useCallback(() => {
    const paramsToShow = getAllParametersToDisplay();
    const grouped = new Map<string, Array<{
      definition: ParameterDefinition;
      values: Map<number, string | null>; // sample_id -> value (null if not assigned)
      isAssigned: Map<number, boolean>; // sample_id -> is assigned
    }>>();
    
    // Initialize structure
    for (const [name, definition] of paramsToShow.entries()) {
      const groupName = resolveParameterGroupName(definition);
      const groupParams = grouped.get(groupName) ?? [];
      const values = new Map<number, string | null>();
      const isAssigned = new Map<number, boolean>();
      
      selectedSamples.forEach(sample => {
        const assigned = assignedParametersBySample.get(sample.sample_id);
        const isParamAssigned = assigned?.has(name) ?? false;
        isAssigned.set(sample.sample_id, isParamAssigned);
        
        if (isParamAssigned) {
          // Get value from sample.parameters (display format)
          const value = sample.parameters?.[name] ?? null;
          values.set(sample.sample_id, value);
        } else {
          values.set(sample.sample_id, null);
        }
      });
      
      groupParams.push({ definition, values, isAssigned });
      grouped.set(groupName, groupParams);
    }
    
    // Sort each group by parameter name
    for (const [groupName, params] of grouped.entries()) {
      params.sort((a, b) => a.definition.name.localeCompare(b.definition.name));
    }
    
    return grouped;
  }, [getAllParametersToDisplay, selectedSamples, assignedParametersBySample]);

  // Prefill value from latest parameter value when parameter name changes
  useEffect(() => {
    if (newParameterName && latestValueQuery.data && !isValuePrefilled) {
      const latest = latestValueQuery.data;
      const formatted = formatParameterHistoryValue(latest);
      if (formatted) {
        setNewParameterValue(formatted);
        setIsValuePrefilled(true);
      }
    }
  }, [newParameterName, latestValueQuery.data, isValuePrefilled]);

  // Reset value prefilled flag when parameter name changes
  useEffect(() => {
    setIsValuePrefilled(false);
  }, [newParameterName]);

  const handleParameterValueChange = useCallback(
    (sampleId: number, parameterName: string, value: string) => {
      const key = `${sampleId}:${parameterName}`;
      setEditingValues((prev) => {
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });
      // Clear prefilled flag when user edits
      if (isValuePrefilled && sampleId === selectedSamples[0]?.sample_id && parameterName === newParameterName) {
        setIsValuePrefilled(false);
      }
    },
    [isValuePrefilled, selectedSamples, newParameterName],
  );

  const handleParameterValueSave = useCallback(
    (sample: SampleListItem, parameterName: string) => {
      const key = `${sample.sample_id}:${parameterName}`;
      const value = editingValues.get(key) ?? sample.parameters?.[parameterName] ?? "";
      const definition = parameterDefinitionMap.get(parameterName);
      const normalized = normalizeParameterValue(definition, value);
      if (normalized) {
        onUpdateParameters(sample, parameterName, normalized);
        setEditingValues((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [editingValues, parameterDefinitionMap, normalizeParameterValue, onUpdateParameters],
  );
  
  // Auto-assign parameters that are only assigned to some samples
  const handleAutoAssignParameters = useCallback(() => {
    const paramsToShow = getAllParametersToDisplay();
    const allAssignedNames = new Set<string>();
    selectedSamples.forEach(sample => {
      const assigned = assignedParametersBySample.get(sample.sample_id);
      if (assigned) {
        assigned.forEach(name => allAssignedNames.add(name));
      }
    });
    
    // Find parameters assigned to some but not all samples
    for (const [name, definition] of paramsToShow.entries()) {
      const samplesWithParam = selectedSamples.filter(sample => {
        const assigned = assignedParametersBySample.get(sample.sample_id);
        return assigned?.has(name) ?? false;
      });
      
      if (samplesWithParam.length > 0 && samplesWithParam.length < selectedSamples.length) {
        // Assign to all samples (without value)
        const normalized = normalizeParameterValue(definition, "");
        if (normalized) {
          selectedSamples.forEach(sample => {
            if (!samplesWithParam.includes(sample)) {
              onUpdateParameters(sample, name, normalized);
            }
          });
        }
      }
    }
  }, [getAllParametersToDisplay, selectedSamples, assignedParametersBySample, onUpdateParameters, normalizeParameterValue]);
  
  // Auto-assign on mount/update (only once when samples change)
  const autoAssignedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (selectedSamples.length > 1 && selectedSamples.every(s => assignedParametersBySample.has(s.sample_id))) {
      const sampleKey = selectedSamples.map(s => s.sample_id).sort().join(',');
      if (!autoAssignedRef.current.has(sampleKey)) {
        handleAutoAssignParameters();
        autoAssignedRef.current.add(sampleKey);
      }
    }
  }, [selectedSamples.map(s => s.sample_id).join(','), assignedParametersBySample.size, handleAutoAssignParameters]);

  const handleAddParameter = useCallback(() => {
    if (!newParameterName || selectedSamples.length === 0) return;

    const definition = parameterDefinitionMap.get(newParameterName);
    let normalizedValue: NormalizedParameterValue | null = null;
    
    // If value provided, normalize it
    if (newParameterValue.trim() !== "") {
      normalizedValue = normalizeParameterValue(definition, newParameterValue.trim());
      if (!normalizedValue) return;
      
      // Extract unit from type if it's a numeric type with unit
      const typeMatch = newParameterType.match(/^(Integer|Real)\s*\(([^)]+)\)$/);
      if (typeMatch && normalizedValue) {
        const unit = typeMatch[2];
        normalizedValue = {
          ...normalizedValue,
          unitSymbol: unit,
          displayValue: normalizedValue.displayValue.includes(unit) 
            ? normalizedValue.displayValue 
            : `${normalizedValue.displayValue} ${unit}`,
        };
      } else if (newParameterUnit && normalizedValue) {
        // Add unit if provided separately
        normalizedValue = {
          ...normalizedValue,
          unitSymbol: newParameterUnit,
          displayValue: normalizedValue.displayValue.includes(newParameterUnit) 
            ? normalizedValue.displayValue 
            : `${normalizedValue.displayValue} ${newParameterUnit}`,
        };
      }
    } else {
      // Empty assignment - create a normalized value with empty display
      normalizedValue = normalizeParameterValue(definition, "");
      if (!normalizedValue) {
        // Create a minimal normalized value for empty assignment
        normalizedValue = {
          value: "",
          displayValue: "",
          unitSymbol: null,
        };
      }
    }

    // Update all selected samples
    for (const sample of selectedSamples) {
      onUpdateParameters(sample, newParameterName, normalizedValue);
    }

    // Reset form
    setNewParameterGroup("");
    setNewParameterName("");
    setNewParameterValue("");
    setNewParameterType("TEXT");
    setNewParameterUnit("");
    setIsValuePrefilled(false);
  }, [
    newParameterName,
    newParameterValue,
    newParameterType,
    newParameterUnit,
    newParameterGroup,
    selectedSamples,
    parameterDefinitionMap,
    normalizeParameterValue,
    onUpdateParameters,
  ]);

  if (selectedSamples.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Sample Details</h2>
          <button
            type="button"
            className="rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
          >
            Done
          </button>
        </header>
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-subtle">No samples selected</p>
        </div>
      </div>
    );
  }

  const parametersByGroup = getParametersByGroupWithValues();
  const parameterHistoryMap = useMemo(() => {
    const map = new Map<string, ParameterValueHistoryItem[]>();
    if (parameterHistoryQuery.data) {
      map.set(newParameterName, parameterHistoryQuery.data);
    }
    return map;
  }, [parameterHistoryQuery.data, newParameterName]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sample Details</h2>
          <p className="text-xs text-subtle">
            {selectedSamples.length} sample{selectedSamples.length !== 1 ? "s" : ""} selected
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setShowAllParameters(!showAllParameters)}
          >
            <input
              type="checkbox"
              checked={showAllParameters}
              onChange={(e) => setShowAllParameters(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>Show all</span>
          </button>
          <button
            type="button"
            className="rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto px-4 py-4 min-h-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-full">
            <thead className="sticky top-0 bg-popover z-10">
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left text-xs font-medium text-subtle whitespace-nowrap">Group</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-subtle whitespace-nowrap">Name</th>
                {selectedSamples.map((sample) => (
                  <th key={sample.sample_id} className="px-3 py-2 text-left text-xs font-medium text-subtle whitespace-nowrap">
                    {sample.code || `Sample ${sample.sample_id}`}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-medium text-subtle whitespace-nowrap">Type</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(parametersByGroup.entries()).map(([groupName, params]) =>
                params.map(({ definition, values, isAssigned }) => {
                  const paramHistory = parameterHistoryMap.get(definition.name) ?? [];
                  const historyValues = paramHistory.map(formatParameterHistoryValue);
                  
                  return (
                    <tr
                      key={definition.name}
                      className={`border-b border-border/40 last:border-b-0 ${
                        Array.from(isAssigned.values()).some(v => !v) ? "text-subtle" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-sm whitespace-nowrap">
                        <div className="relative max-w-[200px] overflow-hidden">
                          <div className="truncate">{groupName}</div>
                          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-popover pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm whitespace-nowrap">
                        <div className="relative max-w-[200px] overflow-hidden">
                          <div className="truncate">{definition.name}</div>
                          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-popover pointer-events-none" />
                        </div>
                      </td>
                      {selectedSamples.map((sample) => {
                        const key = `${sample.sample_id}:${definition.name}`;
                        const editingValue = editingValues.get(key);
                        const currentValue = editingValue !== undefined 
                          ? editingValue 
                          : (values.get(sample.sample_id) ?? "");
                        const isParamAssigned = isAssigned.get(sample.sample_id) ?? false;
                        const paramHistoryForSample = parameterHistoryQuery.data ?? [];
                        const historyValuesForSample = paramHistoryForSample.map(formatParameterHistoryValue);
                        
                        return (
                          <td key={sample.sample_id} className="px-3 py-2">
                            <div className="relative max-w-[200px]">
                              <div className="relative">
                                <input
                                  type="text"
                                  list={`history-${definition.name}-${sample.sample_id}`}
                                  className={`w-full rounded border ${
                                    isValuePrefilled && sample.sample_id === selectedSamples[0]?.sample_id && definition.name === newParameterName
                                      ? "border-blue-500"
                                      : "border-input"
                                  } bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                                  value={currentValue}
                                  onChange={(e) => handleParameterValueChange(sample.sample_id, definition.name, e.target.value)}
                                  onBlur={() => handleParameterValueSave(sample, definition.name)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleParameterValueSave(sample, definition.name);
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  placeholder={isParamAssigned ? "" : "Not assigned"}
                                />
                                {historyValuesForSample.length > 0 && (
                                  <datalist id={`history-${definition.name}-${sample.sample_id}`}>
                                    {historyValuesForSample.map((value, idx) => (
                                      <option key={idx} value={value} />
                                    ))}
                                  </datalist>
                                )}
                              </div>
                              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-popover pointer-events-none" />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-sm whitespace-nowrap">
                        <div className="relative max-w-[150px] overflow-hidden">
                          <div className="truncate">
                            {definition.data_type?.toUpperCase() ?? "TEXT"}
                          </div>
                          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-popover pointer-events-none" />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Add new parameter form */}
        <div className="mt-8 border-t border-border/60 pt-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Add New Parameter</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-subtle">Parameter Group</label>
              <div className="relative">
                <input
                  type="text"
                  list="parameter-groups"
                  className="w-full rounded border border-input bg-background px-2 py-1.5 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={newParameterGroup}
                  onChange={(e) => {
                    setNewParameterGroup(e.target.value);
                    setNewParameterName(""); // Clear parameter name when group changes
                  }}
                  placeholder="Select or type group..."
                />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle pointer-events-none pr-1" />
                <datalist id="parameter-groups">
                  {allGroups.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-subtle">Parameter Name</label>
              <div className="relative">
                <input
                  type="text"
                  list="parameter-names"
                  className="w-full rounded border border-input bg-background px-2 py-1.5 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  value={newParameterName}
                  onChange={(e) => {
                    setNewParameterName(e.target.value);
                    // Update type based on selected parameter
                    if (e.target.value) {
                      const def = parameterDefinitionMap.get(e.target.value);
                      if (def?.data_type) {
                        setNewParameterType(def.data_type.toUpperCase());
                      }
                    }
                  }}
                  disabled={!newParameterGroup}
                  placeholder="Select or type name..."
                />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle pointer-events-none pr-1" />
                <datalist id="parameter-names">
                  {parameterNamesForGroup.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-subtle">Value</label>
              <div className="relative">
                <input
                  type="text"
                  list={`value-history-${newParameterName}`}
                  className={`w-full rounded border ${
                    isValuePrefilled ? "border-blue-500" : "border-input"
                  } bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  value={newParameterValue}
                  onChange={(e) => {
                    setNewParameterValue(e.target.value);
                    setIsValuePrefilled(false);
                  }}
                  placeholder="Enter value..."
                />
                {parameterHistoryQuery.data && parameterHistoryQuery.data.length > 0 && (
                  <datalist id={`value-history-${newParameterName}`}>
                    {parameterHistoryQuery.data.map((item, idx) => {
                      const formatted = formatParameterHistoryValue(item);
                      return <option key={idx} value={formatted} />;
                    })}
                  </datalist>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-subtle">Type</label>
              <div className="relative">
                <input
                  type="text"
                  list="parameter-types"
                  className={`w-full rounded border border-input bg-background px-2 py-1.5 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    newParameterName && parameterDefinitionMap.get(newParameterName) ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  value={newParameterName 
                    ? (() => {
                        const def = parameterDefinitionMap.get(newParameterName);
                        if (def) {
                          return def.data_type?.toUpperCase() ?? "TEXT";
                        }
                        return newParameterType;
                      })()
                    : newParameterType}
                  onChange={(e) => {
                    if (!newParameterName || !parameterDefinitionMap.get(newParameterName)) {
                      // Extract type and unit from input
                      const match = e.target.value.match(/^(Integer|Real|Text|Date)\s*(?:\(([^)]+)\))?/i);
                      if (match) {
                        const type = match[1].toUpperCase();
                        const unit = match[2];
                        setNewParameterType(type);
                        if (unit) {
                          setNewParameterUnit(unit);
                        } else {
                          setNewParameterUnit("");
                        }
                      } else {
                        setNewParameterType(e.target.value);
                      }
                    }
                  }}
                  disabled={!!newParameterName && !!parameterDefinitionMap.get(newParameterName)}
                  placeholder="Select or type type..."
                />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle pointer-events-none pr-1" />
                <datalist id="parameter-types">
                  {allTypes.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleAddParameter}
              disabled={!newParameterName || selectedSamples.length === 0}
            >
              Add Parameter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Register AG Grid modules once
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
  const { mutate: createSample, isPending: isCreatingSample } = useCreateSample();
  const { mutate: deleteSample, isPending: isDeletingSample } = useDeleteSample();
  const { canUndo, canRedo, recordAction, undo, redo } = useHistory();

  // Subscribe to database change notifications
  // Note: project name is null for default project (handled by backend)
  useDatabaseChanges(null);
  const gridApiRef = useRef<GridApi<SampleListItem> | null>(null);
  const columnApiRef = useRef<ColumnApiLike | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const [isGridReady, setIsGridReady] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const toastTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeToastDetail, setActiveToastDetail] = useState<ToastMessage | null>(null);
  const [hasValueByParameter, setHasValueByParameter] = useState<Record<string, boolean>>({});
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined" && window.__LABFRAME_DISABLE_COLUMN_WIDTH_OVERRIDES__) {
      if (isDev) {
        console.info("samples-grid: column width overrides disabled via window flag");
      }
      return {};
    }
    const loaded = loadPersistedColumnWidths() ?? {};
    if (isDev) {
      console.info("samples-grid: loaded column widths from localStorage", loaded);
    }
    return loaded;
  });
  const hasInitializedWidths = useRef(false);

  useEffect(() => {
    if (!hasInitializedWidths.current) {
      hasInitializedWidths.current = true;
      if (isDev) {
        console.info("samples-grid: skipping initial persist");
      }
      return;
    }
    if (typeof window !== "undefined" && window.__LABFRAME_DISABLE_COLUMN_WIDTH_OVERRIDES__) {
      if (isDev) {
        console.info("samples-grid: persistence disabled, skipping column width save");
      }
      return;
    }
    if (isDev) {
      console.info("samples-grid: persisting column widths to localStorage", columnWidthOverrides);
    }
    persistColumnWidths(columnWidthOverrides);
  }, [columnWidthOverrides]);

  const dragSourceGroupRef = useRef<string | null>(null);
  const dragActiveRef = useRef(false);
  const userToggledColumnsRef = useRef<Set<string>>(new Set());
  const columnAutosizeStateRef = useRef<Map<string, 'value' | 'header'>>(new Map());
  const columnsNeedingPaddingAdjustment = useRef<Set<string>>(new Set());
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

  // Wrapper functions for filter setters that track history
  const setGroupFilterWithHistory = useCallback(
    (value: string) => {
      const previousValue = groupFilter;
      if (previousValue !== value) {
        recordAction({
          type: "filter-group",
          previousValue,
          newValue: value,
        });
      }
      setGroupFilter(value);
    },
    [groupFilter, recordAction],
  );

  const setParameterNameFilterWithHistory = useCallback(
    (value: string) => {
      const previousValue = parameterNameFilter;
      if (previousValue !== value) {
        recordAction({
          type: "filter-name",
          previousValue,
          newValue: value,
        });
      }
      setParameterNameFilter(value);
    },
    [parameterNameFilter, recordAction],
  );

  const setParameterValueFilterWithHistory = useCallback(
    (value: string) => {
      const previousValue = parameterValueFilter;
      if (previousValue !== value) {
        recordAction({
          type: "filter-value",
          previousValue,
          newValue: value,
        });
      }
      setParameterValueFilter(value);
    },
    [parameterValueFilter, recordAction],
  );

  const [isAddSampleDialogOpen, setIsAddSampleDialogOpen] = useState(false);
  const [preparedOn, setPreparedOn] = useState<Date | undefined>(undefined);
  const [authorName, setAuthorName] = useState("Frédéric Dubois");
  const [templateSampleId, setTemplateSampleId] = useState<number | null>(null);
  const [copyValues, setCopyValues] = useState(true);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isAuthorDropdownOpen, setIsAuthorDropdownOpen] = useState(false);
  const [isDeleteConfirmDialogOpen, setIsDeleteConfirmDialogOpen] = useState(false);
  const [samplesToDelete, setSamplesToDelete] = useState<SampleListItem[]>([]);
  const [selectedRowCount, setSelectedRowCount] = useState(0);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const [isDetailsOverlayOpen, setIsDetailsOverlayOpen] = useState(false);
  const [isSettingsOverlayOpen, setIsSettingsOverlayOpen] = useState(false);
  const [showCoreColumnsCard, setShowCoreColumnsCard] = useState(true);
  
  // Refs for measuring header element widths for dynamic breakpoints
  const headerRef = useRef<HTMLDivElement | null>(null);
  const columnsButtonRef = useRef<HTMLButtonElement | null>(null);
  const groupFilterRef = useRef<HTMLDivElement | null>(null);
  const nameFilterRef = useRef<HTMLInputElement | null>(null);
  const valueFilterRef = useRef<HTMLInputElement | null>(null);
  const undoRedoButtonsRef = useRef<HTMLDivElement | null>(null);
  const actionButtonsRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidths, setMeasuredWidths] = useState<{
    columnsButton: number;
    groupFilter: number;
    nameFilter: number;
    valueFilter: number;
    undoRedoButtons: number;
    actionButtons: number;
  }>({
    columnsButton: 0,
    groupFilter: 0,
    nameFilter: 0,
    valueFilter: 0,
    undoRedoButtons: 0,
    actionButtons: 0,
  });

  // Use ref to track last widths to prevent infinite loops
  const lastWidthsRef = useRef({
    columnsButton: 0,
    groupFilter: 0,
    nameFilter: 0,
    valueFilter: 0,
    undoRedoButtons: 0,
    actionButtons: 0,
  });

  // Measure header element widths using ResizeObserver
  useEffect(() => {
    if (typeof window === "undefined" || !isMounted) {
      return;
    }

    let rafId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const updateWidths = () => {
      const widths = {
        columnsButton: columnsButtonRef.current?.offsetWidth ?? 0,
        groupFilter: groupFilterRef.current?.offsetWidth ?? 0,
        nameFilter: nameFilterRef.current?.offsetWidth ?? 0,
        valueFilter: valueFilterRef.current?.offsetWidth ?? 0,
        undoRedoButtons: undoRedoButtonsRef.current?.offsetWidth ?? 0,
        actionButtons: actionButtonsRef.current?.offsetWidth ?? 0,
      };
      
      // Only update if widths actually changed to prevent infinite loops
      const hasChanged = Object.keys(widths).some(
        (key) => widths[key as keyof typeof widths] !== lastWidthsRef.current[key as keyof typeof lastWidthsRef.current]
      );
      
      if (hasChanged) {
        lastWidthsRef.current = widths;
        setMeasuredWidths(widths);
      }
    };

    // Initial measurement after elements are rendered
    // Use a longer delay when selectedRowCount changes to ensure buttons are rendered
    const delay = selectedRowCount > 0 ? 100 : 50;
    timeoutId = setTimeout(() => {
      updateWidths();
    }, delay);

    // Use ResizeObserver with debouncing via requestAnimationFrame
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        updateWidths();
        rafId = null;
      });
    });

    // Observe elements when they exist
    const observeElement = (ref: React.RefObject<HTMLElement | null>) => {
      if (ref.current) {
        resizeObserver.observe(ref.current);
      }
    };

    // Delay observation to ensure elements are rendered
    const observeTimeoutId = setTimeout(() => {
      observeElement(columnsButtonRef);
      observeElement(groupFilterRef);
      observeElement(nameFilterRef);
      observeElement(valueFilterRef);
      observeElement(undoRedoButtonsRef);
      observeElement(actionButtonsRef);
    }, 50);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (observeTimeoutId) {
        clearTimeout(observeTimeoutId);
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
    };
  }, [
    parameterNameFilter,
    parameterValueFilter,
    selectedRowCount,
    canUndo,
    canRedo,
    isMounted,
  ]);

  // Handle Escape key to close dialogs
  useEffect(() => {
    if (!isAddSampleDialogOpen && !isDeleteConfirmDialogOpen) {
      return;
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDatePickerOpen) {
          setIsDatePickerOpen(false);
        } else if (isDeleteConfirmDialogOpen) {
          setIsDeleteConfirmDialogOpen(false);
          setSamplesToDelete([]);
        } else {
          setIsAddSampleDialogOpen(false);
          setPreparedOn(undefined);
          setAuthorName("Frédéric Dubois");
          setTemplateSampleId(null);
          setCopyValues(true);
          setIsAuthorDropdownOpen(false);
        }
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAddSampleDialogOpen, isDeleteConfirmDialogOpen, isDatePickerOpen]);

  // Track viewport width for responsive header
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  // Close dropdown menus when clicking outside
  useEffect(() => {
    if (!isFilterMenuOpen && !isActionMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!target) return;
      // Check if click is outside filter menu
      if (isFilterMenuOpen && !document.querySelector('[data-filter-menu]')?.contains(target)) {
        setIsFilterMenuOpen(false);
      }
      // Check if click is outside action menu
      if (isActionMenuOpen && !document.querySelector('[data-action-menu]')?.contains(target)) {
        setIsActionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFilterMenuOpen, isActionMenuOpen]);

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const normalizedParameterNameFilter = parameterNameFilter.trim().toLowerCase();
  const [parameterColumnDefs, setParameterColumnDefs] = useState<ColDef<SampleListItem>[]>([]);
  
  // Filter memory: store last active filter state per column
  const filterMemoryRef = useRef<Map<string, unknown>>(new Map());
  // Track open filter popups to handle close on right-click
  const openFilterPopupsRef = useRef<Set<string>>(new Set());
  // Track columns we're currently changing programmatically to prevent interference
  const isChangingFilterRef = useRef<Set<string>>(new Set());
  // Track columns that are having filters changed programmatically (should not open popups)
  const programmaticallyChangingRef = useRef<Set<string>>(new Set());
  // Track custom header popup state
  const [headerPopupState, setHeaderPopupState] = useState<{
    colId: string;
    x: number;
    y: number;
  } | null>(null);
  // Track parameter detail overlay state
  const [parameterDetailOverlay, setParameterDetailOverlay] = useState<{
    colId: string;
  } | null>(null);

  useEffect(() => {
    startTransition(() => {
      setIsMounted(true);
    });
  }, []);

  useEffect(() => {
    const timeouts = toastTimeouts.current;
    return () => {
      timeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      timeouts.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timeoutId = toastTimeouts.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      toastTimeouts.current.delete(id);
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
    setActiveToastDetail((current) => (current?.id === id ? null : current));
  }, []);

  const scheduleToastDismiss = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) {
        return;
      }
      const existingTimeout = toastTimeouts.current.get(id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      const timeoutId = window.setTimeout(() => {
        dismissToast(id);
      }, duration) as unknown as ReturnType<typeof setTimeout>;
      toastTimeouts.current.set(id, timeoutId);
    },
    [dismissToast],
  );

  const pauseToast = useCallback((id: string) => {
    const timeoutId = toastTimeouts.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      toastTimeouts.current.delete(id);
    }
  }, []);

  const resumeToast = useCallback(
    (toast: ToastMessage) => {
      if (toast.duration <= 0) {
        return;
      }
      scheduleToastDismiss(toast.id, toast.duration);
    },
    [scheduleToastDismiss],
  );

  const handleToastMouseEnter = useCallback(
    (toast: ToastMessage) => {
      pauseToast(toast.id);
    },
    [pauseToast],
  );

  const handleToastMouseLeave = useCallback(
    (toast: ToastMessage) => {
      if (activeToastDetail?.id === toast.id) {
        return;
      }
      resumeToast(toast);
    },
    [activeToastDetail, resumeToast],
  );

  const handleToastClick = useCallback(
    (toast: ToastMessage, event?: React.MouseEvent) => {
      event?.stopPropagation();
      pauseToast(toast.id);
      toastTimeouts.current.delete(toast.id);
      setToasts((previous) => previous.filter((entry) => entry.id !== toast.id));
      setActiveToastDetail(toast);
    },
    [pauseToast],
  );

  const closeToastDetail = useCallback(() => {
    setActiveToastDetail(null);
  }, []);

  useEffect(() => {
    if (!activeToastDetail) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      closeToastDetail();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeToastDetail, closeToastDetail]);

  const showToast = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const variant: ToastVariant = input.variant ?? "info";
      const duration = input.duration ?? DEFAULT_TOAST_DURATION_MS;

      const nextToast: ToastMessage = {
        id,
        summary: input.summary,
        detail: input.detail,
        variant,
        duration,
      };

      setToasts((previous) => [...previous, nextToast]);

      scheduleToastDismiss(id, duration);
    },
    [scheduleToastDismiss],
  );

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
      groups.add(resolveParameterGroupName(definition));
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [parameterDefinitions]);

  useEffect(() => {
    startTransition(() => {
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
      const key = resolveParameterGroupName(definition);
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
      startTransition(() => {
        setGroupFilter("all");
      });
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
    startTransition(() => {
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
      if (typeof config.colDef.width === "number") {
        widths[config.id] = config.colDef.width;
        continue;
      }
      const minWidth = typeof config.colDef.minWidth === "number" ? config.colDef.minWidth : MIN_COLUMN_WIDTH;
      const maxWidth = typeof config.colDef.maxWidth === "number" ? config.colDef.maxWidth : undefined;
      const fieldName = typeof config.colDef.field === "string" ? config.colDef.field : null;

      let maxContentLength = 0;

      if (fieldName) {
        for (const sample of samples) {
          const value = sample[fieldName as keyof SampleListItem];
          const text = value == null ? "" : String(value);
          maxContentLength = Math.max(maxContentLength, text.length);
        }
      }

      // Measure actual text width for proportional fonts
      let maxTextWidth = 0;
      if (fieldName) {
        for (const sample of samples) {
          const value = sample[fieldName as keyof SampleListItem];
          const text = value == null ? "" : String(value);
          if (text) {
            const width = measureTextWidth(text);
            maxTextWidth = Math.max(maxTextWidth, width);
          }
        }
      }
      
      // If no values found, measure header text
      if (maxTextWidth === 0) {
        maxTextWidth = measureTextWidth(config.label);
      }

      const calculatedWidth = Math.max(
        minWidth,
        maxTextWidth + COLUMN_PADDING_PX,
      );

      const resolvedWidth = maxWidth != null ? Math.min(maxWidth, calculatedWidth) : calculatedWidth;

      widths[config.id] = resolvedWidth;
    }

    return widths;
  }, [samples]);

  const baseColumnDefs = useMemo<ColDef<SampleListItem>[]>(
    () =>
      BASE_COLUMN_CONFIG.map((config) => {
        const minWidth = typeof config.colDef.minWidth === "number" ? config.colDef.minWidth : MIN_COLUMN_WIDTH;
        const maxWidth = typeof config.colDef.maxWidth === "number" ? config.colDef.maxWidth : undefined;
        const savedWidth = columnWidthOverrides[config.id];
        const resolvedBaseWidth = (() => {
          const candidate = Math.max(minWidth, baseColumnWidths[config.id] ?? MIN_COLUMN_WIDTH);
          if (maxWidth != null) {
            return Math.min(maxWidth, candidate);
          }
          return candidate;
        })();

        const commonProps: ColDef<SampleListItem> = {
          ...config.colDef,
          headerTooltip: config.label,
          hide: columnVisibility[config.id] === false,
          suppressSizeToFit: true,
        };

        if (config.colDef.resizable === false) {
          return {
            ...commonProps,
            width: savedWidth ?? resolvedBaseWidth,
          };
        }

        return {
          ...commonProps,
          initialWidth: savedWidth ?? resolvedBaseWidth,
        };
      }),
    [baseColumnWidths, columnVisibility, columnWidthOverrides],
  );

  // Compute hasValueByParameter from samples (for column visibility)
  useEffect(() => {
    const hasValue: Record<string, boolean> = {};

    for (const definition of parameterDefinitions) {
      hasValue[definition.name] = false;
    }

    for (const sample of samples) {
      const entries = Object.entries(sample.parameters ?? {});
      for (const [name, rawValue] of entries) {
        if (hasValue[name] === undefined) {
          hasValue[name] = false;
        }
        const text = rawValue == null ? "" : String(rawValue);
        const value = text.trim();
        if (value !== "") {
          hasValue[name] = true;
        }
      }
    }

    startTransition(() => {
      setHasValueByParameter(hasValue);
    });
  }, [parameterDefinitions, samples]);

  // Aggregate unique values from database queries for each parameter
  const parameterNames = useMemo(() => parameterDefinitions.map((def) => def.name), [parameterDefinitions]);
  const uniqueValuesByParameter = useAllParameterUniqueValues(parameterNames);
  
  const valuesByParameter = useMemo(() => {
    const aggregated: Record<string, string[]> = {};
    for (const definition of parameterDefinitions) {
      const values = uniqueValuesByParameter[definition.name] ?? [];
      aggregated[definition.name] = sortParameterValues(values);
    }
    return aggregated;
  }, [parameterDefinitions, uniqueValuesByParameter]);

  const parameterColumnWidths = useMemo(() => {
    const widths: Record<string, number> = {};

    for (const definition of parameterDefinitions) {
      // Measure actual text width for proportional fonts
      let maxTextWidth = 0;

      for (const sample of samples) {
        const rawValue = sample.parameters?.[definition.name];
        const text = rawValue == null ? "" : String(rawValue);
        if (text) {
          const width = measureTextWidth(text);
          maxTextWidth = Math.max(maxTextWidth, width);
        }
      }

  const knownValues = valuesByParameter[definition.name] ?? [];
      for (const value of knownValues) {
        if (value) {
          const width = measureTextWidth(value);
          maxTextWidth = Math.max(maxTextWidth, width);
        }
      }

      // If no values found, measure header text
      if (maxTextWidth === 0) {
        maxTextWidth = measureTextWidth(definition.name);
      }

      const calculatedWidth = Math.max(
        MIN_COLUMN_WIDTH,
        maxTextWidth + COLUMN_PADDING_PX,
      );

      widths[definition.name] = calculatedWidth;
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
    const availableColumnIds = new Set<string>();
    for (const config of BASE_COLUMN_CONFIG) {
      availableColumnIds.add(config.id);
    }
    for (const definition of parameterDefinitions) {
      availableColumnIds.add(`${PARAM_COLUMN_PREFIX}${definition.name}`);
    }
    userToggledColumnsRef.current.forEach((columnId) => {
      if (!availableColumnIds.has(columnId)) {
        userToggledColumnsRef.current.delete(columnId);
      }
    });
    startTransition(() => {
      setColumnWidthOverrides((previous) => {
        const entries = Object.entries(previous);
        if (entries.length === 0) {
          return previous;
        }
        let changed = false;
        const next: Record<string, number> = {};
        for (const [columnId, width] of entries) {
          if (availableColumnIds.has(columnId)) {
            next[columnId] = width;
          } else {
            changed = true;
          }
        }
        return changed ? next : previous;
      });

      setColumnVisibility((previous) => {
        const next: Record<string, boolean> = {};
        let changed = false;

        const applyVisibility = (columnId: string, defaultVisible: boolean) => {
          const wasToggled = userToggledColumnsRef.current.has(columnId);
          const previousValue = previous[columnId];
          const nextValue = wasToggled ? previousValue ?? defaultVisible : defaultVisible;
          next[columnId] = nextValue;
          if (previousValue !== nextValue) {
            changed = true;
          }
        };

        for (const config of BASE_COLUMN_CONFIG) {
          applyVisibility(config.id, config.defaultVisible ?? true);
        }

        for (const definition of parameterDefinitions) {
          const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
          const hasValue = hasValueByParameter[definition.name] ?? false;
          const defaultVisible = groupFilter === "all" ? hasValue : true;
          applyVisibility(colId, defaultVisible);
        }

        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(next);
        if (!changed) {
          if (previousKeys.length !== nextKeys.length) {
            changed = true;
          } else {
            for (const key of previousKeys) {
              if (!(key in next)) {
                changed = true;
                break;
              }
            }
          }
        }

        return changed ? next : previous;
      });
    });
  }, [groupFilter, hasValueByParameter, parameterDefinitions]);

  const displayedParameterNames = useMemo(() => {
    const nameTerm = normalizedParameterNameFilter;

    return parameterDefinitions
      .filter((definition) => {
        const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
        const groupName = resolveParameterGroupName(definition);
        const passesGroupFilter = groupFilter === "all" || groupName === groupFilter;
        const matchesName = nameTerm.length === 0 || definition.name.toLowerCase().includes(nameTerm);
        const fallbackVisible = hasValueByParameter[definition.name] ?? false;
        const toggledVisible = columnVisibility[colId];
        const baseVisible = toggledVisible === undefined ? fallbackVisible : toggledVisible;
        const forcedVisible = groupFilter !== "all" && groupName === groupFilter;
        return passesGroupFilter && matchesName && (baseVisible || forcedVisible);
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

  const commitParameterEdit = useCallback(
    (sample: SampleListItem, parameterName: string, normalized: NormalizedParameterValue) => {
      const previousValue = sample.parameters?.[parameterName] ?? "";
      const newValue = normalized.displayValue;
      
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

      // Record action for history
      recordAction({
        type: "parameter-edit",
        sampleId: sample.sample_id,
        parameterName,
        previousValue,
        newValue,
      });

      mutateSampleParameters(
        {
          sampleId: sample.sample_id,
          assignments,
        },
        {
          onSuccess: (updatedSample) => {
            const parameters = updatedSample.parameters ?? {};

            setHasValueByParameter((previous) => {
              let changed = false;
              const next = { ...previous };

              for (const [name, rawValue] of Object.entries(parameters)) {
                const text = rawValue == null ? "" : String(rawValue);
                const trimmed = text.trim();
                if (!trimmed) {
                  continue;
                }
                if (next[name]) {
                  continue;
                }
                next[name] = true;
                changed = true;
              }

              return changed ? next : previous;
            });

            // valuesByParameter is now computed from database queries via React Query
            // No need to manually update it - cache invalidation handles updates
          },
          onError: (error) => {
            if (isDev) {
              console.info("samples-grid: commit failed", {
                sampleId: sample.sample_id,
                parameter: parameterName,
              });
            }

            const toastContent = resolveParameterEditToast(error, parameterName);

            showToast({
              summary: toastContent.summary,
              detail: toastContent.detail,
              variant: "error",
            });
          },
        },
      );
    },
    [mutateSampleParameters, parameterDefinitionMap, showToast, recordAction],
  );

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    const action = undo();
    if (!action) return;

    switch (action.type) {
      case "parameter-edit": {
        // Find the sample and restore the previous value
        const sample = samples.find((s) => s.sample_id === action.sampleId);
        if (sample) {
          const normalized = {
            displayValue: action.previousValue,
            value: action.previousValue,
            unitSymbol: null,
          };
          commitParameterEdit(sample, action.parameterName, normalized);
        }
        break;
      }
      case "column-visibility": {
        setColumnVisibility((prev) => ({
          ...prev,
          [action.columnId]: action.previousVisible,
        }));
        if (columnApiRef.current) {
          columnApiRef.current.setColumnVisible(action.columnId, action.previousVisible);
        }
        break;
      }
      case "filter-group": {
        setGroupFilter(action.previousValue);
        break;
      }
      case "filter-name": {
        setParameterNameFilter(action.previousValue);
        break;
      }
      case "filter-value": {
        setParameterValueFilter(action.previousValue);
        break;
      }
      case "delete-sample": {
        // Note: Cannot restore deleted sample without backend support
        // This action is recorded but not reversible
        break;
      }
      case "create-sample": {
        // Note: Cannot undo create without backend support
        // This action is recorded but not reversible
        break;
      }
    }
  }, [undo, samples, commitParameterEdit]);

  const handleRedo = useCallback(() => {
    const action = redo();
    if (!action) return;

    switch (action.type) {
      case "parameter-edit": {
        // Find the sample and apply the new value
        const sample = samples.find((s) => s.sample_id === action.sampleId);
        if (sample) {
          const normalized = {
            displayValue: action.newValue,
            value: action.newValue,
            unitSymbol: null,
          };
          commitParameterEdit(sample, action.parameterName, normalized);
        }
        break;
      }
      case "column-visibility": {
        setColumnVisibility((prev) => ({
          ...prev,
          [action.columnId]: action.newVisible,
        }));
        if (columnApiRef.current) {
          columnApiRef.current.setColumnVisible(action.columnId, action.newVisible);
        }
        break;
      }
      case "filter-group": {
        setGroupFilter(action.newValue);
        break;
      }
      case "filter-name": {
        setParameterNameFilter(action.newValue);
        break;
      }
      case "filter-value": {
        setParameterValueFilter(action.newValue);
        break;
      }
      case "delete-sample": {
        // Note: Cannot restore deleted sample without backend support
        break;
      }
      case "create-sample": {
        // Note: Cannot undo create without backend support
        break;
      }
    }
  }, [redo, samples, commitParameterEdit]);

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

    const normalized = normalizeParameterValue(definition, trimmed);

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

      if (rowNode) {
        api.refreshCells({
          rowNodes: [rowNode],
          columns: [`${PARAM_COLUMN_PREFIX}${definition.name}`],
          force: true,
          suppressFlash: true,
        });
      }

      return { applied: true, displayValue: normalized.displayValue };
    },
    [commitParameterEdit],
  );

  useEffect(() => {
    if (parameterGroupEntries.length === 0) {
      startTransition(() => {
        setParameterColumnDefs([]);
      });
      return;
    }

    const defs: ColDef<SampleListItem>[] = [];
    let definitionCount = 0;

    for (const [groupName, definitions] of parameterGroupEntries) {
      const isGroupActive = groupFilter === "all" || groupName === groupFilter;
      for (const definition of definitions) {
        definitionCount += 1;
        const colId = `${PARAM_COLUMN_PREFIX}${definition.name}`;
        const dataType = definition.data_type?.toUpperCase?.() ?? "";
        const isNumericType = dataType === "INTEGER" || dataType === "REAL";
        const fallbackVisible = hasValueByParameter[definition.name] ?? false;
        const toggledVisible = columnVisibility[colId];
        const baseVisible = toggledVisible === undefined ? fallbackVisible : toggledVisible;
        const matchesNameFilter =
          normalizedParameterNameFilter.length === 0 ||
          definition.name.toLowerCase().includes(normalizedParameterNameFilter);
        const forcedVisible = groupFilter !== "all" && groupName === groupFilter;
        const isVisible = isGroupActive && matchesNameFilter && (baseVisible || forcedVisible);
        const optionValues = valuesByParameter[definition.name] ?? [];
        const maxLength = (definition as { max_length?: number }).max_length;
        const maxWidth = typeof maxLength === "number"
          ? Math.min(
              MAX_PARAMETER_COLUMN_WIDTH,
              maxLength * CHARACTER_PIXEL_WIDTH + COLUMN_PADDING_PX,
            )
          : MAX_PARAMETER_COLUMN_WIDTH;
        const baseWidth = Math.min(
          maxWidth,
          Math.max(
            MIN_COLUMN_WIDTH,
            parameterColumnWidths[definition.name] ?? MIN_COLUMN_WIDTH,
          ),
        );
        const savedWidth = columnWidthOverrides[colId];

        const textAlign = isNumericType ? "right" : "left";
        const colDefBase = {
          colId,
          headerName: definition.name,
          headerTooltip: definition.name,
          hide: !isVisible,
          minWidth: MIN_COLUMN_WIDTH,
          suppressSizeToFit: true,
          filter: "agTextColumnFilter",
          filterParams: cloneTextFilterParams(),
          editable: true,
          cellClass: "parameter-value-grid-cell",
          cellRenderer: ParameterValueCellRenderer,
          cellStyle: { padding: 0 },
          valueGetter: (params: ValueGetterParams<SampleListItem, string>) => {
            const value = params.data?.parameters?.[definition.name];
            return value == null ? "" : String(value);
          },
          cellEditor: "parameterValueEditor",
          cellEditorParams: (params: ICellEditorParams<SampleListItem>) => ({
            value: params.value,
            values: optionValues,
            textAlign,
            useTabularNumbers: isNumericType,
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
          valueSetter: (event: ValueSetterParams<SampleListItem>) => {
            if (!event.node) {
              return false;
            }
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
          cellRendererParams: {
            optionValues,
            textAlign,
            useTabularNumbers: isNumericType,
          },
        };

        defs.push({
          ...colDefBase,
          initialWidth: savedWidth ?? baseWidth,
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

    startTransition(() => {
      setParameterColumnDefs(defs);
    });
  }, [
    applyParameterCandidate,
    columnVisibility,
    columnWidthOverrides,
    groupFilter,
    hasValueByParameter,
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

  const hideAutoSelectionColumns = useCallback(() => {
    if (!columnApiRef.current) {
      return;
    }
    const columns = columnApiRef.current.getAllColumns?.() ?? [];
    for (const column of columns) {
      const colId = column?.getColId?.() ?? column?.colId ?? null;
      if (!colId) {
        continue;
      }
      if (colId === "__selection__") {
        continue;
      }
      const colDef = column?.getColDef?.();
      const isAutoSelectionColumn = colId.startsWith("ag-Grid-AutoColumn") || colId.startsWith("ag-Grid-Selection");
      if (isAutoSelectionColumn || colDef?.checkboxSelection) {
        columnApiRef.current.setColumnVisible(colId, false);
      }
    }
  }, []);

  const skipNextColumnDefUpdate = useRef(false);
  const columnsBeingAutosized = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!gridApiRef.current || !isGridReady) {
      return;
    }
    
    // Skip column def update immediately after user resize to prevent jump
    if (skipNextColumnDefUpdate.current) {
      skipNextColumnDefUpdate.current = false;
      if (isDev) {
        console.info("samples-grid: skipping column def update after user resize");
      }
      return;
    }
    
    if (isDev) {
      console.info("samples-grid: applying column definitions");
    }
    
    gridApiRef.current.setGridOption("columnDefs", computedColumnDefs);
    hideAutoSelectionColumns();
  }, [computedColumnDefs, hideAutoSelectionColumns, isGridReady]);

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


  // Helper function to close filter popup
  const closeFilterPopup = useCallback((colId: string) => {
    // Remove from tracking first to prevent re-opening
    openFilterPopupsRef.current.delete(colId);
    
    // Try to find and close AG Grid's filter popup
    // AG Grid might have multiple popups, so we need to close all and check each one
    const allPopups = document.querySelectorAll('.ag-filter-popup, .ag-popup-child, [class*="filter-popup"], [class*="ag-overlay"], [class*="ag-popup"]');
    
    for (const popup of allPopups) {
      if (!(popup instanceof HTMLElement)) {
        continue;
      }
      
      // Check if this popup is for our column or is a filter popup
      const columnAttr = popup.getAttribute('col-id') || popup.closest('[col-id]')?.getAttribute('col-id');
      const isFilterPopup = popup.classList.toString().includes('filter') || 
                            popup.querySelector('.ag-filter') ||
                            popup.closest('.ag-filter-popup');
      
      if (!columnAttr || columnAttr === colId || isFilterPopup) {
        // Close the popup by pressing Escape
        const escapeEvent = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
        });
        popup.dispatchEvent(escapeEvent);
        
        // Also try clicking on the popup's backdrop or outside area
        const backdrop = popup.closest('.ag-popup-parent');
        if (backdrop instanceof HTMLElement) {
          backdrop.click();
        }
        
        // Try to find and click a close button
        const closeButton = popup.querySelector('button[aria-label*="close" i], button[aria-label*="Close" i], .ag-popup-button, [role="button"]');
        if (closeButton instanceof HTMLElement) {
          closeButton.click();
        }
      }
    }
    
    // Also try clicking outside on the document body as a fallback
    document.body.click();
  }, []);

  // Helper function to check if filter is active
  const isFilterActive = useCallback((colId: string): boolean => {
    if (!gridApiRef.current) {
      return false;
    }
    const gridApiWithFilter = gridApiRef.current as GridApi<SampleListItem> & {
      getFilterModel?: () => Record<string, unknown> | null;
    };
    const filterModel = gridApiWithFilter.getFilterModel?.();
    return filterModel != null && colId in filterModel;
  }, []);

  // Helper function to open filter popup
  const openFilterPopup = useCallback((colId: string, column: ReturnType<GridApi<SampleListItem>['getColumn']>) => {
    if (!gridApiRef.current || !column) {
      return;
    }

    // Close any existing popups first
    const openColIds = Array.from(openFilterPopupsRef.current);
    for (const openColId of openColIds) {
      if (openColId !== colId) {
        closeFilterPopup(openColId);
      }
    }

    const gridApi = gridApiRef.current;
    const apiWithFilter = gridApi as GridApi<SampleListItem> & {
      showColumnFilter?: (col: typeof column) => void;
    };
    
    if (typeof apiWithFilter.showColumnFilter === 'function') {
      apiWithFilter.showColumnFilter(column);
      openFilterPopupsRef.current.add(colId);
      return;
    }

    // Try to get filter instance and trigger popup
    const gridApiWithFilter = gridApi as GridApi<SampleListItem> & {
      getFilterInstance?: (colId: string) => unknown;
    };
    const filterInstance = gridApiWithFilter.getFilterInstance?.(colId);
    if (filterInstance) {
      const filterApi = filterInstance as {
        getGui?: () => HTMLElement;
        [key: string]: unknown;
      };
      if (typeof filterApi.getGui === 'function') {
        const filterGui = filterApi.getGui();
        if (filterGui instanceof HTMLElement) {
          const popupTrigger = filterGui.querySelector(
            'button[aria-label*="filter" i], .ag-filter-button, button[class*="filter"]'
          );
          if (popupTrigger instanceof HTMLElement) {
            popupTrigger.click();
            openFilterPopupsRef.current.add(colId);
            return;
          }
        }
      }
    }

    // Try to find and click filter button in header
    const headerCell = document.querySelector(`.ag-header-cell[col-id="${colId}"]`);
    if (headerCell instanceof HTMLElement) {
      const filterButton = headerCell.querySelector(
        '.ag-header-menu-button, .ag-icon-filter, button[aria-label*="filter" i], [class*="filter" i]'
      );
      if (filterButton instanceof HTMLElement) {
        filterButton.click();
        openFilterPopupsRef.current.add(colId);
      }
    }
  }, [closeFilterPopup]);

  // Helper function to clear filter
  const clearFilter = useCallback((colId: string, shouldClosePopup = true) => {
    if (!gridApiRef.current) {
      return;
    }
    // Mark this column as being changed programmatically
    isChangingFilterRef.current.add(colId);
    
    const gridApi = gridApiRef.current;
    const gridApiWithFilter = gridApi as GridApi<SampleListItem> & {
      setFilterModel?: (model: Record<string, unknown> | null) => void;
      getFilterModel?: () => Record<string, unknown> | null;
    };
    
    if (typeof gridApiWithFilter.getFilterModel === 'function' && typeof gridApiWithFilter.setFilterModel === 'function') {
      const currentModel = gridApiWithFilter.getFilterModel() ?? {};
      // Only proceed if this column actually has a filter
      if (!(colId in currentModel)) {
        // No filter to clear, but popup might be open - close it if requested
        if (shouldClosePopup && openFilterPopupsRef.current.has(colId)) {
          closeFilterPopup(colId);
        }
        isChangingFilterRef.current.delete(colId);
        return;
      }
      
      const newModel = { ...currentModel };
      delete newModel[colId];
      gridApiWithFilter.setFilterModel(Object.keys(newModel).length > 0 ? newModel : null);
      
      // Only close popup if explicitly requested
      // When shouldClosePopup is false, we want to keep popup state as-is
      if (shouldClosePopup && openFilterPopupsRef.current.has(colId)) {
        // Force close the popup immediately
        closeFilterPopup(colId);
        // Double-check and close again after a brief delay to ensure it's closed
        setTimeout(() => {
          closeFilterPopup(colId);
        }, 50);
        setTimeout(() => {
          closeFilterPopup(colId);
        }, 100);
      }
      // If shouldClosePopup is false, don't touch popup state at all
      
      // Remove from changing set after a short delay
      setTimeout(() => {
        isChangingFilterRef.current.delete(colId);
      }, 100);
    } else {
      isChangingFilterRef.current.delete(colId);
    }
  }, [closeFilterPopup]);

  // Helper function to restore last filter
  const restoreLastFilter = useCallback((colId: string) => {
    const lastFilter = filterMemoryRef.current.get(colId);
    if (!lastFilter || !gridApiRef.current) {
      return;
    }
    // Mark this column as being changed programmatically
    isChangingFilterRef.current.add(colId);
    
    const gridApi = gridApiRef.current;
    const gridApiWithFilter = gridApi as GridApi<SampleListItem> & {
      setFilterModel?: (model: Record<string, unknown> | null) => void;
      getFilterModel?: () => Record<string, unknown> | null;
    };
    
    if (typeof gridApiWithFilter.getFilterModel === 'function' && typeof gridApiWithFilter.setFilterModel === 'function') {
      const currentModel = gridApiWithFilter.getFilterModel() ?? {};
      const newModel = { ...currentModel, [colId]: lastFilter };
      gridApiWithFilter.setFilterModel(newModel);
      
      // Remove from changing set after a short delay
      setTimeout(() => {
        isChangingFilterRef.current.delete(colId);
      }, 100);
    } else {
      isChangingFilterRef.current.delete(colId);
    }
  }, []);

  // Helper function to save current filter state
  const saveFilterState = useCallback((colId: string) => {
    if (!gridApiRef.current) {
      return;
    }
    const gridApi = gridApiRef.current;
    const gridApiWithFilter = gridApi as GridApi<SampleListItem> & {
      getFilterModel?: () => Record<string, unknown> | null;
    };
    
    if (typeof gridApiWithFilter.getFilterModel === 'function') {
      const filterModel = gridApiWithFilter.getFilterModel();
      if (filterModel && colId in filterModel) {
        filterMemoryRef.current.set(colId, filterModel[colId]);
      }
    }
  }, []);

  // Attach click and context menu handlers to column headers
  useEffect(() => {
    if (!isGridReady || !gridApiRef.current || !gridContainerRef.current) {
      return;
    }

    // MutationObserver to catch and remove popups that AG Grid opens after programmatic filter changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (!(addedNode instanceof HTMLElement)) {
            continue;
          }
          
          // Check if this is a filter popup
          const isFilterPopup = addedNode.classList.contains('ag-filter-popup') ||
                                addedNode.classList.contains('ag-popup-child') ||
                                addedNode.classList.contains('ag-popup') ||
                                addedNode.classList.contains('ag-overlay') ||
                                addedNode.querySelector('.ag-filter-popup') ||
                                addedNode.querySelector('.ag-filter') ||
                                addedNode.closest('.ag-filter-popup');
          
          if (isFilterPopup) {
            const popupEl = addedNode.querySelector('.ag-filter-popup') || 
                           addedNode.closest('.ag-filter-popup') ||
                           addedNode;
            
            // Find the column ID for this popup
            let colId: string | null = popupEl.getAttribute('col-id') || 
                                      popupEl.closest('[col-id]')?.getAttribute('col-id') ||
                                      null;
            
            // If we can't find it from attributes, try to match by position
            if (!colId) {
              const headerCells = document.querySelectorAll('.ag-header-cell[col-id]');
              for (const headerCell of headerCells) {
                if (!(headerCell instanceof HTMLElement)) continue;
                const headerColId = headerCell.getAttribute('col-id');
                if (!headerColId || headerColId === '__selection__' || headerColId === '__padding__') continue;
                
                if (programmaticallyChangingRef.current.has(headerColId)) {
                  try {
                    const rect = headerCell.getBoundingClientRect();
                    const popupRect = popupEl.getBoundingClientRect();
                    if (Math.abs(popupRect.left - rect.left) < 200 && 
                        Math.abs(popupRect.top - rect.bottom) < 100) {
                      colId = headerColId;
                      break;
                    }
                  } catch {
                    // getBoundingClientRect might fail
                  }
                }
              }
            }
            
            // If this popup is for a column we're programmatically changing, remove it
            if (colId && colId !== '__selection__' && colId !== '__padding__' && 
                programmaticallyChangingRef.current.has(colId)) {
              // Remove from DOM immediately
              if (addedNode.parentNode) {
                addedNode.parentNode.removeChild(addedNode);
              }
              openFilterPopupsRef.current.delete(colId);
              continue;
            }
          }
        }
      }
    });

    // Observe the document body for new popups
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const handleHeaderClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      // Check if click is on filter button
      const filterButton = target.closest('.ag-header-menu-button, .ag-icon-filter, button[aria-label*="filter" i]');
      if (!filterButton) {
        return;
      }

      const headerCell = target.closest('.ag-header-cell');
      if (!(headerCell instanceof HTMLElement)) {
        return;
      }

      const colId = headerCell.getAttribute('col-id');
      if (!colId || colId === '__selection__' || colId === '__padding__') {
        return;
      }

      const column = gridApiRef.current?.getColumn(colId);
      if (!column) {
        return;
      }

      const colDef = column.getColDef();
      if (colDef.filter === false) {
        return;
      }

      // Check conditions once for both mousedown and click
      const filterIsActive = isFilterActive(colId);
      const hasMemory = filterMemoryRef.current.has(colId);
      const popupIsOpen = openFilterPopupsRef.current.has(colId);

      // Only handle mousedown - prevent the click event from ever firing
      if (event.type === 'mousedown' && event.button === 0) {
        // Determine what action to take based on current state
        let shouldHandle = false;
        let action: (() => void) | null = null;

        if (filterIsActive) {
          // Filter active: clear it on left-click (don't affect popup state)
          shouldHandle = true;
          action = () => {
            saveFilterState(colId);
            // Mark as programmatically changing to prevent popup from opening
            programmaticallyChangingRef.current.add(colId);
            clearFilter(colId, false); // Never close popup on left-click
            // Remove from programmatically changing after filter change completes
            setTimeout(() => {
              programmaticallyChangingRef.current.delete(colId);
            }, 100);
          };
        } else if (hasMemory && !filterIsActive) {
          // Memory exists, no active filter: restore it on left-click (don't affect popup)
          shouldHandle = true;
          action = () => {
            // Mark as programmatically changing to prevent popup from opening
            programmaticallyChangingRef.current.add(colId);
            restoreLastFilter(colId);
            // Remove from programmatically changing after filter change completes
            setTimeout(() => {
              programmaticallyChangingRef.current.delete(colId);
            }, 100);
          };
        } else if (!hasMemory && !filterIsActive) {
          // No memory, no active filter: left-click behavior
          if (!popupIsOpen) {
            // Popup closed: always open it
            shouldHandle = true;
            action = () => openFilterPopup(colId, column);
          } else {
            // Popup open: do nothing (keep it open to remind user to enter filter)
            shouldHandle = false;
          }
        }

        if (shouldHandle && action) {
          // Aggressively prevent AG Grid from seeing this event
          event.preventDefault();
          event.stopImmediatePropagation();
          event.stopPropagation();
          
          // Disable pointer events on the filter button to prevent any click from registering
          if (filterButton instanceof HTMLElement) {
            filterButton.style.pointerEvents = 'none';
            // Re-enable after a short delay to allow future clicks
            setTimeout(() => {
              if (filterButton instanceof HTMLElement) {
                filterButton.style.pointerEvents = '';
              }
            }, 100);
          }
          
          // Prevent the click event from firing at all
          const preventClick = (e: Event) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
          };
          filterButton.addEventListener('click', preventClick, { once: true, capture: true });
          
          // Execute action immediately
          action();
          
          return false;
        }
        // Should not reach here, but if we do, let AG Grid handle it
        return;
      }
      
      // For click events, always prevent if it's a left-click on filter button
      if (event.type === 'click' && event.button === 0) {
        // Always prevent left-click on filter button - we handle it in mousedown
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        return false;
      }
    };

    const handleHeaderContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const headerCell = target.closest('.ag-header-cell');
      if (!(headerCell instanceof HTMLElement)) {
        return;
      }

      const colId = headerCell.getAttribute('col-id');
      if (!colId || colId === '__selection__' || colId === '__padding__') {
        return;
      }

      const column = gridApiRef.current?.getColumn(colId);
      if (!column) {
        return;
      }

      // Check if right-click is on filter button
      const filterButton = target.closest('.ag-header-menu-button, .ag-icon-filter, button[aria-label*="filter" i]');
      
      if (filterButton) {
        // Right-click on filter button
        event.preventDefault();
        event.stopPropagation();

        const colDef = column.getColDef();
        if (colDef.filter === false) {
          return;
        }

        // Check if popup is open
        if (openFilterPopupsRef.current.has(colId)) {
          // Close the popup only - don't clear the filter
          closeFilterPopup(colId);
        } else {
          // Open the filter popup
          openFilterPopup(colId, column);
        }
      } else {
        // Right-click on header (outside filter button) - show custom popup
        event.preventDefault();
        event.stopPropagation();

        setHeaderPopupState({
          colId,
          x: event.clientX,
          y: event.clientY,
        });
      }
    };

    // Attach event listeners
    // Use both mousedown and click to catch AG Grid's handlers
    const container = gridContainerRef.current;
    container.addEventListener('mousedown', handleHeaderClick, true);
    container.addEventListener('click', handleHeaderClick, true);
    container.addEventListener('contextmenu', handleHeaderContextMenu, true);

    // Cleanup
    return () => {
      observer.disconnect();
      container.removeEventListener('mousedown', handleHeaderClick, true);
      container.removeEventListener('click', handleHeaderClick, true);
      container.removeEventListener('contextmenu', handleHeaderContextMenu, true);
    };
  }, [isGridReady, isFilterActive, clearFilter, restoreLastFilter, openFilterPopup, closeFilterPopup, saveFilterState]);

  // Listen for filter model changes to update memory
  useEffect(() => {
    if (!isGridReady || !gridApiRef.current) {
      return;
    }

    // Set up a periodic check for filter model changes
    // This is needed because AG Grid doesn't expose a filter model change event easily
    // Reduced interval from 500ms to 2000ms to reduce CPU usage on resource-constrained systems
    const interval = setInterval(() => {
      if (!gridApiRef.current) {
        return;
      }
      const gridApi = gridApiRef.current;
      const gridApiWithFilter = gridApi as GridApi<SampleListItem> & {
        getFilterModel?: () => Record<string, unknown> | null;
      };
      
      if (typeof gridApiWithFilter.getFilterModel === 'function') {
        const filterModel = gridApiWithFilter.getFilterModel();
        if (filterModel) {
          // Save active filters to memory (but skip columns we're currently changing)
          for (const [colId, filterValue] of Object.entries(filterModel)) {
            if (filterValue != null && !isChangingFilterRef.current.has(colId)) {
              filterMemoryRef.current.set(colId, filterValue);
            }
          }
        }
      }
    }, 2000); // Increased from 500ms to 2000ms to reduce CPU usage

    return () => clearInterval(interval);
  }, [isGridReady]);

  const defaultColDef = useMemo<ColDef<SampleListItem>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: false,
      flex: 0,
      minWidth: 90,
      editable: false,
    }),
    [],
  );

  const handleGridReady = useCallback((event: GridReadyEvent<SampleListItem>) => {
    gridApiRef.current = event.api;
    const columnApi = (event as GridReadyEvent<SampleListItem> & { columnApi?: ColumnApiLike }).columnApi;
    columnApiRef.current = columnApi ?? null;
    setIsGridReady(true);
    // Initialize selected row count
    const selectedRows = event.api.getSelectedRows();
    setSelectedRowCount(selectedRows.length);
  }, []);

  const handleSelectionChanged = useCallback((event: SelectionChangedEvent<SampleListItem>) => {
    const selectedRows = event.api.getSelectedRows();
    const count = selectedRows.length;
    // Update state immediately for responsive UI
    setSelectedRowCount(count);
  }, []);

  const handleFirstDataRendered = useCallback(
    (event: FirstDataRenderedEvent<SampleListItem>) => {
      event.api.refreshHeader();
      hideAutoSelectionColumns();
    },
    [hideAutoSelectionColumns],
  );

  const handleCellMouseDown = useCallback((event: CellMouseDownEvent<SampleListItem>) => {
    const colDef = event.column?.getColDef?.();
    if (!colDef?.checkboxSelection) {
      return;
    }
    const nativeEvent = event.event;
    if (nativeEvent && "stopPropagation" in nativeEvent && typeof nativeEvent.stopPropagation === "function") {
      nativeEvent.stopPropagation();
    }
  }, []);

  const handleCellKeyDown = useCallback((event: CellKeyDownEvent<SampleListItem>) => {
    const nativeEvent = event.event;
    if (!(nativeEvent instanceof KeyboardEvent)) {
      return;
    }
    
    const rowIndex = event.node?.rowIndex;
    const colId = event.column?.getColId?.() ?? event.column?.getId?.();
    if (rowIndex == null || !colId) {
      return;
    }
    
    // Handle Option+Enter or Alt+Enter to open dropdown
    // Option key on Mac and Alt key on Windows both map to altKey
    if (nativeEvent.altKey && nativeEvent.key === "Enter") {
      // Only open dropdown if this is a parameter column with alternate options
      if (colId.startsWith(PARAM_COLUMN_PREFIX)) {
        const paramName = colId.slice(PARAM_COLUMN_PREFIX.length);
        const knownValues = valuesByParameter[paramName] ?? [];
        const hasAlternateOptions = knownValues.length > 1;
        
        if (hasAlternateOptions) {
          nativeEvent.preventDefault();
          nativeEvent.stopPropagation();
          openDropdownForCell(event.api, rowIndex, colId);
          return;
        }
      }
    }
    
    // Regular Enter key behavior - enter edit mode
    if (nativeEvent.key === "Enter") {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      
      // Check if this cell is currently being edited
      const editingCells = event.api.getEditingCells();
      const isCurrentlyEditing = editingCells.some(
        (cell) => cell.rowIndex === rowIndex && cell.colKey === colId
      );
      
      if (!isCurrentlyEditing) {
        // Not editing - start editing (Enter press)
        // Use requestAnimationFrame to ensure the Enter key event is fully processed
        // The editor's afterGuiAttached will place cursor at end
        requestAnimationFrame(() => {
          event.api.startEditingCell({ rowIndex, colKey: colId });
        });
      }
      // If already editing, let the editor handle Enter (it will commit and close)
    }
  }, [valuesByParameter]);

  const handleColumnResized = useCallback((event: ColumnResizedEvent<SampleListItem>) => {
    if (!event.finished) {
      return;
    }
    
    // Handle autosize (double-click) - cycle between header and content width
    // Check if this is an autosize event (type-safe check)
    const isAutosize = event.source === 'autosizeColumns' || (event.source as string) === 'autosizeColumns';
    if (isAutosize) {
      const resizedColumns = event.columns ?? (event.column ? [event.column] : []);
      if (!resizedColumns || resizedColumns.length === 0 || !gridApiRef.current) {
        return;
      }
      
      // Get column IDs and filter out invalid ones
      const columnIds = resizedColumns
        .map((col) => col.getColId())
        .filter((colId): colId is string => colId !== null && colId !== fillerColumnDef.colId);
      
      if (columnIds.length === 0) {
        return;
      }
      
      // Check if any of the columns are already being autosized (prevents infinite loop)
      // This happens when we trigger our own width changes (header sizing or adjustment)
      const alreadyAutosizing = columnIds.some((colId) => columnsBeingAutosized.current.has(colId));
      if (alreadyAutosizing) {
        // This event was triggered by our own autosize operation via setColumnWidths
        // Ignore it completely - don't process it, don't save it, just clean up
        // The width was already saved to overrides above, so nothing to do here
        setTimeout(() => {
          for (const colId of columnIds) {
            columnsBeingAutosized.current.delete(colId);
          }
        }, 100);
        return;
      }
      
      // Mark all columns as being autosized BEFORE any operations (prevents race condition)
      for (const colId of columnIds) {
        columnsBeingAutosized.current.add(colId);
      }
      
      for (const column of resizedColumns) {
        const colId = column.getColId();
        if (!colId || colId === fillerColumnDef.colId) {
          continue;
        }
        
        // Unified handling for both base and parameter columns
        const isParameterColumn = colId.startsWith(PARAM_COLUMN_PREFIX);
        
        // Helper function to calculate value width (used for detection and application)
        const calculateValueWidth = (): number => {
          let maxContentWidth = 0;
          
          if (gridApiRef.current) {
            gridApiRef.current.forEachNode((node) => {
              if (node.data) {
                let cellValue: string = '';
                
                if (isParameterColumn) {
                  const sample = node.data as SampleListItem;
                  const paramName = colId.replace(PARAM_COLUMN_PREFIX, '');
                  const paramValue = sample.parameters?.[paramName];
                  if (paramValue) {
                    cellValue = String(paramValue);
                  }
                } else {
                  const colDef = column.getColDef?.();
                  const field = colDef?.field;
                  if (field && typeof field === 'string') {
                    const sample = node.data as SampleListItem;
                    const value = sample[field as keyof SampleListItem];
                    cellValue = value == null ? '' : String(value);
                  }
                }
                
                if (cellValue) {
                  const textWidth = measureTextWidth(cellValue);
                  maxContentWidth = Math.max(maxContentWidth, textWidth);
                }
              }
            });
          }
          
          return Math.max(
            MIN_COLUMN_WIDTH,
            maxContentWidth + COLUMN_PADDING_PX - AUTOSIZE_PADDING_ADJUSTMENT_PX
          );
        };
        
        // Helper function to calculate header width
        const calculateHeaderWidth = (): number => {
          const findHeaderElement = (): HTMLElement | null => {
            let headerEl = document.querySelector(`.ag-header-cell[col-id="${colId}"]`);
            if (headerEl instanceof HTMLElement) {
              return headerEl;
            }
            if (gridApiRef.current) {
              const col = gridApiRef.current.getColumn(colId);
              if (col) {
                const allHeaders = document.querySelectorAll('.ag-header-cell');
                for (const header of allHeaders) {
                  if (header instanceof HTMLElement && header.getAttribute('col-id') === colId) {
                    return header;
                  }
                }
              }
            }
            return null;
          };
          
          const headerElement = findHeaderElement();
          if (headerElement instanceof HTMLElement) {
            const headerRect = headerElement.getBoundingClientRect();
            return Math.max(MIN_COLUMN_WIDTH, headerRect.width - AUTOSIZE_PADDING_ADJUSTMENT_PX);
          } else {
            // Fallback: measure header text
            const colDef = column.getColDef?.();
            const headerName = colDef?.headerName || '';
            const headerTextWidth = measureTextWidth(headerName);
            return Math.max(
              MIN_COLUMN_WIDTH,
              headerTextWidth + COLUMN_PADDING_PX - AUTOSIZE_PADDING_ADJUSTMENT_PX
            );
          }
        };
        
        // Get current autosize state - always check the state from the ref first
        let currentState = columnAutosizeStateRef.current.get(colId);
        
        // Calculate both widths ONCE for detection and application
        const currentWidth = column.getActualWidth();
        let finalTargetWidth: number | null = null;
        
        // If state is not set, detect which state the column is currently in
        // This only happens on the very first double-click for this column OR when state was lost
        if (!currentState && currentWidth) {
          // Check if there's a saved width override - if it matches expected width, use saved state
          const savedWidth = columnWidthOverrides[colId];
          
          // Calculate both widths for comparison
          const expectedHeaderWidth = calculateHeaderWidth();
          const expectedValueWidth = calculateValueWidth();
          
          // Check if current width matches either expected width (within 5px tolerance for robustness)
          const isAtHeaderWidth = expectedHeaderWidth && Math.abs(currentWidth - expectedHeaderWidth) <= 5;
          const isAtValueWidth = expectedValueWidth && Math.abs(currentWidth - expectedValueWidth) <= 5;
          
          if (isAtHeaderWidth && !isAtValueWidth) {
            // At header width - cycle to value
            currentState = 'header';
          } else if (isAtValueWidth && !isAtHeaderWidth) {
            // At value width - cycle to header
            currentState = 'value';
          } else {
            // Width doesn't match either expected width - it's custom width
            // Cycle to value first
            currentState = 'header'; // At custom width - cycle to value first
          }
        } else if (!currentState) {
          // Default to 'header' if we can't determine - this will make nextState = 'value'
          // This ensures custom widths cycle to value first, then header second
          currentState = 'header';
        }
        
        // Cycle to the opposite state
        const nextState = currentState === 'value' ? 'header' : 'value';
        
        // IMPORTANT: Save the state BEFORE applying the width change
        // This ensures the state is correct for the next cycle
        columnAutosizeStateRef.current.set(colId, nextState);
        
        // Calculate FINAL target width ONCE based on nextState
        if (nextState === 'header') {
          finalTargetWidth = calculateHeaderWidth();
        } else {
          finalTargetWidth = calculateValueWidth();
        }
        
        // Apply the FINAL width ONCE - directly to DOM first, then sync with AG Grid
        // This prevents visual jumps by ensuring the width is set before AG Grid processes it
        if (finalTargetWidth !== null && gridApiRef.current) {
          // IMPORTANT: Save width to overrides BEFORE applying to prevent reverting
          // This ensures the width persists even if AG Grid tries to revert it
          setColumnWidthOverrides((previous) => {
            const updated = { ...previous };
            updated[colId] = finalTargetWidth;
            return updated;
          });
          
          // Apply width directly to AG Grid - don't manipulate DOM directly
          // Manipulating DOM directly prevents the handle from moving when dragging
          gridApiRef.current.setColumnWidths([{ key: colId, newWidth: finalTargetWidth }]);
        }
        
        // Cleanup after a short delay to allow the columnResized event from setColumnWidths to be processed and ignored
        setTimeout(() => {
          columnsBeingAutosized.current.delete(colId);
        }, 100);
        
        if (isDev) {
          console.info(`samples-grid: autosizing ${colId} to ${nextState} (${nextState === 'header' ? 'header' : 'content'}) - finalWidth: ${finalTargetWidth}`);
        }
      }
      
      // For autosize, we already saved the width to overrides above, so don't continue to normal handler
      // This prevents the normal handler from potentially reverting the width
      return;
    }
    
    // Only handle user-initiated resizes (drag or double-click autosize)
    const isUserResize = event.source === 'uiColumnResized' || (event.source as string) === 'autosizeColumns';
    if (!isUserResize) {
      if (isDev) {
        console.info(`samples-grid: ignoring non-user resize, source: ${event.source}`);
      }
      return;
    }
    const resizedColumns = event.columns ?? (event.column ? [event.column] : []);
    if (!resizedColumns || resizedColumns.length === 0) {
      return;
    }

    // Set flag to skip next column def update
    skipNextColumnDefUpdate.current = true;
    
    setColumnWidthOverrides((previous) => {
      let changed = false;
      const next = { ...previous };

      for (const column of resizedColumns) {
        const colId = column.getColId();
        if (!colId) {
          continue;
        }
        if (colId === fillerColumnDef.colId) {
          continue;
        }
        const actualWidth = Math.round(column.getActualWidth());
        if (!Number.isFinite(actualWidth) || actualWidth <= 0) {
          continue;
        }
        const colDef = column.getColDef?.();
        const minWidth = typeof colDef?.minWidth === "number" ? colDef.minWidth : MIN_COLUMN_WIDTH;
        const maxWidth = (() => {
          if (typeof colDef?.maxWidth === "number") {
            return colDef.maxWidth;
          }
          if (colId.startsWith(PARAM_COLUMN_PREFIX)) {
            return MAX_PARAMETER_COLUMN_WIDTH;
          }
          return undefined;
        })();
        let normalizedWidth = Math.max(minWidth, actualWidth);
        if (maxWidth != null) {
          normalizedWidth = Math.min(maxWidth, normalizedWidth);
        }
        if (next[colId] === normalizedWidth) {
          continue;
        }
        next[colId] = normalizedWidth;
        changed = true;
        if (isDev) {
          console.info(`samples-grid: column ${colId} resized to ${normalizedWidth}px`);
        }
      }

      if (isDev && changed) {
        console.info("samples-grid: handleColumnResized updating state", next);
      }
      
      // If nothing changed, clear the skip flag
      if (!changed) {
        skipNextColumnDefUpdate.current = false;
      }
      
      return changed ? next : previous;
    });
  }, [fillerColumnDef.colId, samples, valuesByParameter]);

  const handleToggleColumnMenu = useCallback(() => {
    setIsColumnMenuOpen((previous) => !previous);
  }, []);

  const handleToggleAllParameterGroups = useCallback(() => {
    setColumnPickerSelection((previous) => {
      if (previous.mode === "all") {
        setShowCoreColumnsCard(false);
        return { mode: "custom", selections: [] };
      }
      setShowCoreColumnsCard(true);
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

  const computeDefaultVisibility = useCallback(
    (columnId: string): boolean => {
      const baseConfig = BASE_COLUMN_CONFIG.find((config) => config.id === columnId);
      if (baseConfig) {
        return baseConfig.defaultVisible ?? true;
      }
      if (columnId.startsWith(PARAM_COLUMN_PREFIX)) {
        const parameterName = columnId.slice(PARAM_COLUMN_PREFIX.length);
  const hasValue = hasValueByParameter[parameterName] ?? false;
        return groupFilter === "all" ? hasValue : true;
      }
      return true;
    },
    [groupFilter, hasValueByParameter],
  );

  const handleColumnVisibilityChange = useCallback(
    (columnId: string, visible: boolean) => {
      const defaultVisible = computeDefaultVisibility(columnId);
      if (visible === defaultVisible) {
        userToggledColumnsRef.current.delete(columnId);
      } else {
        userToggledColumnsRef.current.add(columnId);
      }

      setColumnVisibility((previous) => {
        const previousVisible = previous[columnId] ?? defaultVisible;
        if (previousVisible === visible) {
          return previous;
        }
        
        // Record action for history
        recordAction({
          type: "column-visibility",
          columnId,
          previousVisible,
          newVisible: visible,
        });
        
        return {
          ...previous,
          [columnId]: visible,
        };
      });
    },
    [computeDefaultVisibility, recordAction],
  );

  // Handler to hide column from custom popup
  const handleHideColumn = useCallback((colId: string) => {
    handleColumnVisibilityChange(colId, false);
    setHeaderPopupState(null);
  }, [handleColumnVisibilityChange]);

  // Handler to show parameter details overlay
  const handleShowDetails = useCallback((colId: string) => {
    setParameterDetailOverlay({ colId });
    setHeaderPopupState(null);
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
  const activeToastDetailLines = activeToastDetail
    ? splitDetailMessage(activeToastDetail.detail ?? activeToastDetail.summary)
    : null;

  return (
    <main className="flex h-screen min-h-screen flex-col gap-6 bg-background p-6">
      <header className="flex w-full flex-wrap items-center justify-between gap-3">
        <h1
          className="text-2xl font-semibold tracking-tight md:text-3xl"
          style={{ fontFamily: '"Geist Sans", var(--font-sans)' }}
        >
          LabFrame
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <ProjectSelector />
          <SettingsButton onOpen={() => setIsSettingsOverlayOpen(true)} />
        </div>
      </header>

      {isError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error?.message ?? "Failed to load samples."}
        </p>
      ) : null}

    <section className="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
        {/* Responsive header with modular width calculations */}
        <div ref={headerRef}>
        {(() => {
          // Constants
          const GAP = 8; // gap-2 = 0.5rem = 8px
          const PADDING = 32; // px-4 = 16px on each side
          
          // Get viewport width
          const useMeasuredValues = isMounted && Object.values(measuredWidths).some(w => w > 0);
          const defaultWidth = 1200;
          const width = useMeasuredValues && viewportWidth 
            ? viewportWidth 
            : (typeof window !== "undefined" && isMounted ? window.innerWidth : defaultWidth);
          
          // Element widths (use measured or fallback)
          const columnsButtonWidth = useMeasuredValues ? (measuredWidths.columnsButton || 100) : 100;
          const groupFilterWidth = useMeasuredValues ? (measuredWidths.groupFilter || 200) : 200;
          const nameFilterFullWidth = useMeasuredValues ? (measuredWidths.nameFilter || 180) : 180;
          const valueFilterFullWidth = useMeasuredValues ? (measuredWidths.valueFilter || 180) : 180;
          const nameFilterShrunkWidth = 120;
          const valueFilterShrunkWidth = 120;
          
          // Button widths (text vs icon-only)
          const undoRedoWithTextWidth = 160;
          const undoRedoIconOnlyWidth = 80;
          const addButtonWithTextWidth = 80;
          const addButtonIconOnlyWidth = 40;
          const detailsButtonWithTextWidth = 80;
          const detailsButtonIconOnlyWidth = 40;
          const deleteButtonWithTextWidth = 80;
          const deleteButtonIconOnlyWidth = 40;
          const visibilityButtonWidth = 100;
          const actionDropdownWidth = 80;
          
          // Calculate filter widths
          const fullFiltersWidth = groupFilterWidth + GAP + nameFilterFullWidth + GAP + valueFilterFullWidth;
          const shrunkFiltersWidth = groupFilterWidth + GAP + nameFilterShrunkWidth + GAP + valueFilterShrunkWidth;
          
          // Calculate action button widths for different stages
          const getActionButtonsWidth = (
            addIcon: boolean,
            detailsIcon: boolean,
            deleteIcon: boolean,
            hasDetails: boolean,
            hasDelete: boolean
          ) => {
            if (!hasDetails && !hasDelete) {
              return addIcon ? addButtonIconOnlyWidth : addButtonWithTextWidth;
            }
            const addW = addIcon ? addButtonIconOnlyWidth : addButtonWithTextWidth;
            const detailsW = hasDetails ? (detailsIcon ? detailsButtonIconOnlyWidth : detailsButtonWithTextWidth) : 0;
            const deleteW = hasDelete ? (deleteIcon ? deleteButtonIconOnlyWidth : deleteButtonWithTextWidth) : 0;
            return addW + (hasDetails ? GAP + detailsW : 0) + (hasDelete ? GAP + deleteW : 0);
          };
          
          const actionButtonsAllText = getActionButtonsWidth(false, false, false, selectedRowCount > 0, selectedRowCount > 0);
          const actionButtonsDeleteIcon = getActionButtonsWidth(false, false, true, selectedRowCount > 0, selectedRowCount > 0);
          const actionButtonsDeleteDetailsIcon = getActionButtonsWidth(false, true, true, selectedRowCount > 0, selectedRowCount > 0);
          const actionButtonsAllIcon = getActionButtonsWidth(true, true, true, selectedRowCount > 0, selectedRowCount > 0);
          
          // Calculate single-row layout width
          const singleRowWidth = 
            columnsButtonWidth + GAP +
            fullFiltersWidth + GAP +
            undoRedoWithTextWidth + GAP +
            actionButtonsAllText + PADDING;
          
          // Determine layout: single-row or two-row
          const useSingleRow = width >= singleRowWidth;
          const availableWidth = width - PADDING;
          
          // Calculate filter state (for both single-row and two-row)
          const spaceForFilters = useSingleRow
            ? (availableWidth - columnsButtonWidth - GAP - undoRedoWithTextWidth - GAP - actionButtonsAllText)
            : (availableWidth - columnsButtonWidth - GAP);
          
          const showFullFilters = spaceForFilters >= fullFiltersWidth;
          const showShrunkFilters = !showFullFilters && spaceForFilters >= shrunkFiltersWidth;
          const showCollapsedFilters = !showFullFilters && !showShrunkFilters;
          
          // Calculate action button collapse stages FIRST
          // Start with maximum space available (assuming Undo/Redo with text for initial calculation)
          const secondRowAvailableWidth = availableWidth;
          const initialActionButtonsSpace = useSingleRow
            ? (availableWidth - columnsButtonWidth - GAP - fullFiltersWidth - GAP - undoRedoWithTextWidth)
            : secondRowAvailableWidth;
          
          let showActionDropdown = false;
          let showDeleteAsIcon = false;
          let showDetailsAsIcon = false;
          let showAddAsIcon = false;
          let actionButtonsWidth = actionButtonsAllText;
          
          if (selectedRowCount > 0) {
            // Check stages from least space needed to most space needed
            // Stage 5: Collapse into Action dropdown (least space)
            if (initialActionButtonsSpace < (actionDropdownWidth + GAP)) {
              showActionDropdown = true;
              actionButtonsWidth = actionDropdownWidth;
            }
            // Stage 4: All buttons as icons
            else if (initialActionButtonsSpace < (actionButtonsAllIcon + GAP)) {
              showAddAsIcon = true;
              showDetailsAsIcon = true;
              showDeleteAsIcon = true;
              actionButtonsWidth = actionButtonsAllIcon;
            }
            // Stage 3: Delete + Details as icons
            else if (initialActionButtonsSpace < (actionButtonsDeleteDetailsIcon + GAP)) {
              showDetailsAsIcon = true;
              showDeleteAsIcon = true;
              actionButtonsWidth = actionButtonsDeleteDetailsIcon;
            }
            // Stage 2: Only Delete as icon
            else if (initialActionButtonsSpace < (actionButtonsDeleteIcon + GAP)) {
              showDeleteAsIcon = true;
              actionButtonsWidth = actionButtonsDeleteIcon;
            }
            // Stage 1: All buttons with text (most space)
            else {
              actionButtonsWidth = actionButtonsAllText;
            }
          } else {
            // Only Add button
            if (initialActionButtonsSpace < (actionDropdownWidth + GAP)) {
              showActionDropdown = true;
              actionButtonsWidth = actionDropdownWidth;
            } else if (initialActionButtonsSpace < (addButtonIconOnlyWidth + GAP)) {
              showAddAsIcon = true;
              actionButtonsWidth = addButtonIconOnlyWidth;
            } else {
              actionButtonsWidth = addButtonWithTextWidth;
            }
          }
          
          // Calculate Undo/Redo collapse AFTER action buttons are determined
          let undoRedoWidth = undoRedoWithTextWidth;
          let showUndoRedoText = true;
          
          if (useSingleRow) {
            // In single-row, Undo/Redo comes after action buttons (right-aligned)
            const spaceForUndoRedo = availableWidth - columnsButtonWidth - GAP - fullFiltersWidth - GAP - actionButtonsWidth;
            showUndoRedoText = spaceForUndoRedo >= (undoRedoWithTextWidth + GAP);
            undoRedoWidth = showUndoRedoText ? undoRedoWithTextWidth : undoRedoIconOnlyWidth;
          } else {
            // In two-row, Undo/Redo is right-aligned, action buttons are left-aligned
            // Flex space takes up remaining space, so we just need to check if there's enough for Undo/Redo
            const spaceForUndoRedo = secondRowAvailableWidth - actionButtonsWidth - GAP;
            showUndoRedoText = spaceForUndoRedo >= (undoRedoWithTextWidth + GAP);
            undoRedoWidth = showUndoRedoText ? undoRedoWithTextWidth : undoRedoIconOnlyWidth;
          }

          // Render layout based on useSingleRow
          if (useSingleRow) {
            // Single-row layout: all elements in one row
            return (
              <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-4 py-3">
                {/* Columns button - hidden when Visibility button is shown */}
                {!showCollapsedFilters && (
                  <div className="relative">
                    <button
                      ref={columnsButtonRef}
                      type="button"
                      className={`flex h-9 items-center gap-2 rounded border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isColumnMenuOpen
                          ? "bg-muted/70 hover:bg-muted/90 active:bg-muted/60"
                          : "bg-muted hover:bg-muted/90 active:bg-muted/70"
                      }`}
                      onClick={handleToggleColumnMenu}
                      aria-expanded={isColumnMenuOpen}
                      aria-haspopup="dialog"
                    >
                      <Filter className="h-4 w-4" aria-hidden="true" />
                      Columns
                    </button>
                  </div>
                )}
                
                {/* Visibility button - only shown when filters are collapsed */}
                {showCollapsedFilters && (
                  <div className="relative" data-filter-menu>
                    <button
                      type="button"
                      className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                    >
                      <Filter className="h-4 w-4" />
                      Visibility
                    </button>
                    {isFilterMenuOpen && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card p-3 shadow-lg">
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium">Columns</label>
                            <button
                              type="button"
                              className={`flex h-9 w-full items-center gap-2 rounded border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                isColumnMenuOpen
                                  ? "bg-muted/70 hover:bg-muted/90 active:bg-muted/60"
                                  : "bg-muted hover:bg-muted/90 active:bg-muted/70"
                              }`}
                              onClick={() => {
                                handleToggleColumnMenu();
                                setIsFilterMenuOpen(false);
                              }}
                              aria-expanded={isColumnMenuOpen}
                              aria-haspopup="dialog"
                            >
                              <Filter className="h-4 w-4" aria-hidden="true" />
                              Columns
                            </button>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Parameter group</label>
                            <ParameterGroupFilterControl
                              groups={parameterGroups}
                              value={groupFilter}
                              onChange={setGroupFilterWithHistory}
                              disabled={parameterGroupSelectDisabled}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Filter section - always visible, collapses when needed */}
                {!showCollapsedFilters && (
                  <div ref={groupFilterRef} className="text-sm">
                    <span className="sr-only">Parameter group</span>
                    <ParameterGroupFilterControl
                      groups={parameterGroups}
                      value={groupFilter}
                      onChange={setGroupFilterWithHistory}
                      disabled={parameterGroupSelectDisabled}
                    />
                  </div>
                )}
                
                {/* Filter fields - always visible in the row (not in Visibility dropdown) */}
                {showFullFilters ? (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="sr-only">Parameter name</span>
                      <input
                        ref={nameFilterRef}
                        type="text"
                        className="h-9 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        style={{ 
                          width: parameterNameFilter ? `${Math.max(180, parameterNameFilter.length * 8 + 24)}px` : '180px',
                          minWidth: '180px'
                        }}
                        placeholder="Filter parameter name"
                        value={parameterNameFilter}
                        onChange={(event) => setParameterNameFilterWithHistory(event.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="sr-only">Parameter value</span>
                      <input
                        ref={valueFilterRef}
                        type="text"
                        className="h-9 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        style={{ 
                          width: parameterValueFilter ? `${Math.max(180, parameterValueFilter.length * 8 + 24)}px` : '180px',
                          minWidth: '180px'
                        }}
                        placeholder="Filter parameter value"
                        value={parameterValueFilter}
                        onChange={(event) => setParameterValueFilterWithHistory(event.target.value)}
                      />
                    </label>
                  </>
                ) : showShrunkFilters ? (
                  <>
                    <label className="flex flex-1 items-center gap-2 text-sm min-w-0">
                      <span className="sr-only">Parameter name</span>
                      <input
                        ref={nameFilterRef}
                        type="text"
                        className="h-9 flex-1 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        style={{ minWidth: '120px' }}
                        placeholder="Name"
                        value={parameterNameFilter}
                        onChange={(event) => setParameterNameFilterWithHistory(event.target.value)}
                      />
                    </label>
                    <label className="flex flex-1 items-center gap-2 text-sm min-w-0">
                      <span className="sr-only">Parameter value</span>
                      <input
                        ref={valueFilterRef}
                        type="text"
                        className="h-9 flex-1 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        style={{ minWidth: '120px' }}
                        placeholder="Value"
                        value={parameterValueFilter}
                        onChange={(event) => setParameterValueFilterWithHistory(event.target.value)}
                      />
                    </label>
                  </>
                ) : null}
                
                {/* Action buttons (Add, Details, Delete) */}
                <div ref={actionButtonsRef} className="flex items-center gap-2">
                  {showActionDropdown ? (
                    <div className="relative" data-action-menu>
                      <button
                        type="button"
                        className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setIsActionMenuOpen((prev) => !prev)}
                      >
                        Action
                      </button>
                      {isActionMenuOpen && (
                        <ul
                          role="listbox"
                          className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                        >
                          <li role="option">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                              onClick={() => {
                                const today = new Date();
                                setPreparedOn(today);
                                setAuthorName("Frédéric Dubois");
                                setIsDatePickerOpen(false);
                                const mostRecentSample = samples.length > 0 
                                  ? samples.reduce((latest, current) => 
                                      current.sample_id > latest.sample_id ? current : latest
                                    )
                                  : null;
                                setTemplateSampleId(mostRecentSample?.sample_id ?? null);
                                setIsAddSampleDialogOpen(true);
                                setIsActionMenuOpen(false);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                              Add
                            </button>
                          </li>
                          {selectedRowCount > 0 && (
                            <>
                              <li role="option">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                                  onClick={() => {
                                    if (!gridApiRef.current) return;
                                    const selectedRows = gridApiRef.current.getSelectedRows();
                                    if (selectedRows.length === 0) return;
                                    setIsDetailsOverlayOpen(true);
                                    setIsActionMenuOpen(false);
                                  }}
                                >
                                  <FileText className="h-4 w-4" />
                                  Details
                                </button>
                              </li>
                              <li role="option">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                                  onClick={() => {
                                    if (selectedRowCount === 0 || !gridApiRef.current) {
                                      return;
                                    }
                                    const selectedRows = gridApiRef.current.getSelectedRows();
                                    if (selectedRows.length === 0) {
                                      return;
                                    }
                                    setSamplesToDelete(selectedRows);
                                    setIsDeleteConfirmDialogOpen(true);
                                    setIsActionMenuOpen(false);
                                  }}
                                  disabled={isDeletingSample}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </li>
                            </>
                          )}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          showAddAsIcon ? 'px-2' : ''
                        }`}
                        onClick={() => {
                          const today = new Date();
                          setPreparedOn(today);
                          setAuthorName("Frédéric Dubois");
                          setIsDatePickerOpen(false);
                          const mostRecentSample = samples.length > 0 
                            ? samples.reduce((latest, current) => 
                                current.sample_id > latest.sample_id ? current : latest
                              )
                            : null;
                          setTemplateSampleId(mostRecentSample?.sample_id ?? null);
                          setIsAddSampleDialogOpen(true);
                        }}
                        title="Add"
                      >
                        <Plus className="h-4 w-4" />
                        {!showAddAsIcon && <span>Add</span>}
                      </button>
                      {selectedRowCount > 0 && (
                        <>
                          <button
                            type="button"
                            className={`flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              showDetailsAsIcon ? 'px-2' : ''
                            }`}
                            onClick={() => {
                              if (!gridApiRef.current) return;
                              const selectedRows = gridApiRef.current.getSelectedRows();
                              if (selectedRows.length === 0) return;
                              setIsDetailsOverlayOpen(true);
                            }}
                            title="Details"
                          >
                            <FileText className="h-4 w-4" />
                            {!showDetailsAsIcon && <span>Details</span>}
                          </button>
                          <button
                            type="button"
                            className={`flex h-9 items-center gap-2 rounded border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-border bg-muted text-foreground hover:bg-muted/90 active:bg-muted/70 ${
                              showDeleteAsIcon ? 'px-2' : ''
                            }`}
                            onClick={() => {
                              if (selectedRowCount === 0 || !gridApiRef.current) {
                                return;
                              }
                              const selectedRows = gridApiRef.current.getSelectedRows();
                              if (selectedRows.length === 0) {
                                return;
                              }
                              setSamplesToDelete(selectedRows);
                              setIsDeleteConfirmDialogOpen(true);
                            }}
                            disabled={isDeletingSample}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            {!showDeleteAsIcon && <span>Delete</span>}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
                
                {/* Undo/Redo buttons - right-aligned */}
                <div ref={undoRedoButtonsRef} className="flex items-center gap-2 ml-auto">
                  {showUndoRedoText ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="h-9 px-3 text-sm"
                        title="Undo"
                      >
                        <Undo2 className="h-4 w-4 mr-1.5" />
                        Undo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="h-9 px-3 text-sm"
                        title="Redo"
                      >
                        <Redo2 className="h-4 w-4 mr-1.5" />
                        Redo
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="h-9 px-2"
                        title="Undo"
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="h-9 px-2"
                        title="Redo"
                      >
                        <Redo2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          } else {
            // Two-row layout: first row has visibility controls only, second row has Undo/Redo + Action buttons
            return (
              <div className="flex flex-col gap-2 border-b border-border/40 bg-muted/30 px-4 py-3">
                {/* First row: Visibility controls only (Columns + filter controls) - left-aligned */}
                <div className="flex items-center gap-2">
                  {/* Columns button - hidden when Visibility button is shown */}
                  {!showCollapsedFilters && (
                    <div className="relative">
                      <button
                        ref={columnsButtonRef}
                        type="button"
                        className={`flex h-9 items-center gap-2 rounded border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isColumnMenuOpen
                            ? "bg-muted/70 hover:bg-muted/90 active:bg-muted/60"
                            : "bg-muted hover:bg-muted/90 active:bg-muted/70"
                        }`}
                        onClick={handleToggleColumnMenu}
                        aria-expanded={isColumnMenuOpen}
                        aria-haspopup="dialog"
                      >
                        <Filter className="h-4 w-4" aria-hidden="true" />
                        Columns
                      </button>
                    </div>
                  )}
                  
                  {/* Visibility button - only shown when filters are collapsed */}
                  {showCollapsedFilters && (
                    <div className="relative" data-filter-menu>
                      <button
                        type="button"
                        className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                      >
                        <Filter className="h-4 w-4" />
                        Visibility
                      </button>
                      {isFilterMenuOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-card p-3 shadow-lg">
                          <div className="space-y-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium">Columns</label>
                              <button
                                type="button"
                                className={`flex h-9 w-full items-center gap-2 rounded border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                  isColumnMenuOpen
                                    ? "bg-muted/70 hover:bg-muted/90 active:bg-muted/60"
                                    : "bg-muted hover:bg-muted/90 active:bg-muted/70"
                                }`}
                                onClick={() => {
                                  handleToggleColumnMenu();
                                  setIsFilterMenuOpen(false);
                                }}
                                aria-expanded={isColumnMenuOpen}
                                aria-haspopup="dialog"
                              >
                                <Filter className="h-4 w-4" aria-hidden="true" />
                                Columns
                              </button>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium">Parameter group</label>
                              <ParameterGroupFilterControl
                                groups={parameterGroups}
                                value={groupFilter}
                                onChange={setGroupFilterWithHistory}
                                disabled={parameterGroupSelectDisabled}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Filter section - always visible, collapses when needed */}
                  {!showCollapsedFilters && (
                    <div ref={groupFilterRef} className="text-sm">
                      <span className="sr-only">Parameter group</span>
                      <ParameterGroupFilterControl
                        groups={parameterGroups}
                        value={groupFilter}
                        onChange={setGroupFilterWithHistory}
                        disabled={parameterGroupSelectDisabled}
                      />
                    </div>
                  )}
                  
                  {/* Filter fields - always visible in the row (not in Visibility dropdown) */}
                  {showFullFilters ? (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">Parameter name</span>
                        <input
                          ref={nameFilterRef}
                          type="text"
                          className="h-9 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          style={{ 
                            width: parameterNameFilter ? `${Math.max(180, parameterNameFilter.length * 8 + 24)}px` : '180px',
                            minWidth: '180px'
                          }}
                          placeholder="Filter parameter name"
                          value={parameterNameFilter}
                          onChange={(event) => setParameterNameFilterWithHistory(event.target.value)}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">Parameter value</span>
                        <input
                          ref={valueFilterRef}
                          type="text"
                          className="h-9 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          style={{ 
                            width: parameterValueFilter ? `${Math.max(180, parameterValueFilter.length * 8 + 24)}px` : '180px',
                            minWidth: '180px'
                          }}
                          placeholder="Filter parameter value"
                          value={parameterValueFilter}
                          onChange={(event) => setParameterValueFilterWithHistory(event.target.value)}
                        />
                      </label>
                    </>
                  ) : showShrunkFilters ? (
                    <>
                      <label className="flex flex-1 items-center gap-2 text-sm min-w-0">
                        <span className="sr-only">Parameter name</span>
                        <input
                          ref={nameFilterRef}
                          type="text"
                          className="h-9 flex-1 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          style={{ minWidth: '120px' }}
                          placeholder="Name"
                          value={parameterNameFilter}
                          onChange={(event) => setParameterNameFilterWithHistory(event.target.value)}
                        />
                      </label>
                      <label className="flex flex-1 items-center gap-2 text-sm min-w-0">
                        <span className="sr-only">Parameter value</span>
                        <input
                          ref={valueFilterRef}
                          type="text"
                          className="h-9 flex-1 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          style={{ minWidth: '120px' }}
                          placeholder="Value"
                          value={parameterValueFilter}
                          onChange={(event) => setParameterValueFilterWithHistory(event.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                </div>

                {/* Second row: Action buttons (left) + flex space + Undo/Redo (right) */}
                <div className="flex items-center gap-2">
                  {/* Action buttons (Add, Details, Delete) - left-aligned */}
                  <div ref={actionButtonsRef} className="flex items-center gap-2">
                    {showActionDropdown ? (
                      <div className="relative" data-action-menu>
                        <button
                          type="button"
                          className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setIsActionMenuOpen((prev) => !prev)}
                        >
                          Action
                        </button>
                        {isActionMenuOpen && (
                          <ul
                            role="listbox"
                            className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-md border border-border bg-card shadow-lg"
                          >
                            <li role="option">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                                onClick={() => {
                                  const today = new Date();
                                  setPreparedOn(today);
                                  setAuthorName("Frédéric Dubois");
                                  setIsDatePickerOpen(false);
                                  const mostRecentSample = samples.length > 0 
                                    ? samples.reduce((latest, current) => 
                                        current.sample_id > latest.sample_id ? current : latest
                                      )
                                    : null;
                                  setTemplateSampleId(mostRecentSample?.sample_id ?? null);
                                  setIsAddSampleDialogOpen(true);
                                  setIsActionMenuOpen(false);
                                }}
                              >
                                <Plus className="h-4 w-4" />
                                Add
                              </button>
                            </li>
                            {selectedRowCount > 0 && (
                              <>
                                <li role="option">
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                                    onClick={() => {
                                      if (!gridApiRef.current) return;
                                      const selectedRows = gridApiRef.current.getSelectedRows();
                                      if (selectedRows.length === 0) return;
                                      setIsDetailsOverlayOpen(true);
                                      setIsActionMenuOpen(false);
                                    }}
                                  >
                                    <FileText className="h-4 w-4" />
                                    Details
                                  </button>
                                </li>
                                <li role="option">
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                                    onClick={() => {
                                      if (selectedRowCount === 0 || !gridApiRef.current) {
                                        return;
                                      }
                                      const selectedRows = gridApiRef.current.getSelectedRows();
                                      if (selectedRows.length === 0) {
                                        return;
                                      }
                                      setSamplesToDelete(selectedRows);
                                      setIsDeleteConfirmDialogOpen(true);
                                      setIsActionMenuOpen(false);
                                    }}
                                    disabled={isDeletingSample}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </button>
                                </li>
                              </>
                            )}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            showAddAsIcon ? 'px-2' : ''
                          }`}
                          onClick={() => {
                            const today = new Date();
                            setPreparedOn(today);
                            setAuthorName("Frédéric Dubois");
                            setIsDatePickerOpen(false);
                            const mostRecentSample = samples.length > 0 
                              ? samples.reduce((latest, current) => 
                                  current.sample_id > latest.sample_id ? current : latest
                                )
                              : null;
                            setTemplateSampleId(mostRecentSample?.sample_id ?? null);
                            setIsAddSampleDialogOpen(true);
                          }}
                          title="Add"
                        >
                          <Plus className="h-4 w-4" />
                          {!showAddAsIcon && <span>Add</span>}
                        </button>
                        {selectedRowCount > 0 && (
                          <>
                            <button
                              type="button"
                              className={`flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                showDetailsAsIcon ? 'px-2' : ''
                              }`}
                              onClick={() => {
                                if (!gridApiRef.current) return;
                                const selectedRows = gridApiRef.current.getSelectedRows();
                                if (selectedRows.length === 0) return;
                                setIsDetailsOverlayOpen(true);
                              }}
                              title="Details"
                            >
                              <FileText className="h-4 w-4" />
                              {!showDetailsAsIcon && <span>Details</span>}
                            </button>
                            <button
                              type="button"
                              className={`flex h-9 items-center gap-2 rounded border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-border bg-muted text-foreground hover:bg-muted/90 active:bg-muted/70 ${
                                showDeleteAsIcon ? 'px-2' : ''
                              }`}
                              onClick={() => {
                                if (selectedRowCount === 0 || !gridApiRef.current) {
                                  return;
                                }
                                const selectedRows = gridApiRef.current.getSelectedRows();
                                if (selectedRows.length === 0) {
                                  return;
                                }
                                setSamplesToDelete(selectedRows);
                                setIsDeleteConfirmDialogOpen(true);
                              }}
                              disabled={isDeletingSample}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                              {!showDeleteAsIcon && <span>Delete</span>}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* Flex space between Action buttons and Undo/Redo */}
                  <div className="flex-1" />
                  
                  {/* Undo/Redo buttons - right-aligned */}
                  <div ref={undoRedoButtonsRef} className="flex items-center gap-2">
                    {showUndoRedoText ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleUndo}
                          disabled={!canUndo}
                          className="h-9 px-3 text-sm"
                          title="Undo"
                        >
                          <Undo2 className="h-4 w-4 mr-1.5" />
                          Undo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRedo}
                          disabled={!canRedo}
                          className="h-9 px-3 text-sm"
                          title="Redo"
                        >
                          <Redo2 className="h-4 w-4 mr-1.5" />
                          Redo
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleUndo}
                          disabled={!canUndo}
                          className="h-9 px-2"
                          title="Undo"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRedo}
                          disabled={!canRedo}
                          className="h-9 px-2"
                          title="Redo"
                        >
                          <Redo2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          }
        })()}
        </div>

        {isAddSampleDialogOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsAddSampleDialogOpen(false);
                setPreparedOn(undefined);
                setAuthorName("Frédéric Dubois");
                setTemplateSampleId(null);
                setCopyValues(true);
                setIsDatePickerOpen(false);
                setIsAuthorDropdownOpen(false);
              }
            }}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-[15rem] rounded-lg border border-border bg-card shadow-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!preparedOn) {
                    return;
                  }
                  createSample(
                    {
                      prepared_on: format(preparedOn, "yyyy-MM-dd"),
                      author_name: authorName.trim() || null,
                      template_sample_id: templateSampleId,
                      copy_parameters: templateSampleId !== null && copyValues,
                    },
                    {
                      onSuccess: (createdSample) => {
                        // Record action for history
                        recordAction({
                          type: "create-sample",
                          sampleId: createdSample.sample_id,
                          sample: createdSample,
                        });
                        setIsAddSampleDialogOpen(false);
                        setPreparedOn(undefined);
                        setAuthorName("Frédéric Dubois");
                        setTemplateSampleId(null);
                        setCopyValues(true);
                        setIsDatePickerOpen(false);
                      },
                      onError: (error) => {
                        console.error("Failed to create sample:", error);
                      },
                    },
                  );
                }}
                className="space-y-4"
              >
                {(() => {
                  // Compute unique authors from samples
                  const uniqueAuthors = Array.from(
                    new Set(
                      samples
                        .map((s) => s.author_name)
                        .filter((name): name is string => name !== null && name.trim() !== "")
                    )
                  ).sort();
                  const showAuthorDropdown = uniqueAuthors.length > 1;

                  // Compute button width for author field
                  const buttonWidth = 200; // Approximate width of Cancel + Add sample buttons with gap

                  return (
                    <>
                      <div>
                        <label
                          htmlFor="template-sample"
                          className="mb-2 block text-sm font-medium text-foreground"
                        >
                          Template
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            id="template-sample"
                            value={templateSampleId ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setTemplateSampleId(value === "" ? null : Number(value));
                            }}
                            className="h-9 w-auto min-w-[120px] rounded border border-border bg-background px-3 pr-8 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent appearance-none bg-no-repeat bg-right pr-3"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                              backgroundPosition: "right 0.5rem center",
                              paddingRight: "2rem",
                            }}
                          >
                            <option value="">None</option>
                            {samples.map((sample) => (
                              <option key={sample.sample_id} value={sample.sample_id}>
                                {sample.code || `Sample ${sample.sample_id}`}
                              </option>
                            ))}
                          </select>
                          {templateSampleId !== null && (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={copyValues}
                                onChange={(e) => setCopyValues(e.target.checked)}
                                className="h-4 w-4 rounded border-border"
                              />
                              <span className="text-sm text-foreground">Copy values</span>
                            </label>
                          )}
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="prepared-on"
                          className="mb-2 block text-sm font-medium text-foreground"
                        >
                          Date of preparation
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="prepared-on"
                            type="text"
                            required
                            readOnly
                            value={preparedOn ? format(preparedOn, "yyyy-MM-dd") : ""}
                            className="h-9 w-32 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          />
                          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex h-9 w-9 items-center justify-center rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <CalendarIcon className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={preparedOn}
                                onSelect={(date) => {
                                  setPreparedOn(date);
                                  setIsDatePickerOpen(false);
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="author-name"
                          className="mb-2 block text-sm font-medium text-foreground"
                        >
                          Author
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="author-name"
                            type="text"
                            value={authorName}
                            onChange={(e) => setAuthorName(e.target.value)}
                            className="h-9 rounded border border-border bg-background px-3 text-sm transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            style={{ width: `${buttonWidth}px` }}
                            placeholder="Enter author name (optional)"
                          />
                          {showAuthorDropdown && (
                            <Popover open={isAuthorDropdownOpen} onOpenChange={setIsAuthorDropdownOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="flex h-9 w-9 items-center justify-center rounded border border-border bg-background transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <ul className="max-h-48 overflow-auto p-1">
                                  {uniqueAuthors.map((author) => (
                                    <li key={author}>
                                      <button
                                        type="button"
                                        className="w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                                        onClick={() => {
                                          setAuthorName(author);
                                          setIsAuthorDropdownOpen(false);
                                        }}
                                      >
                                        {author}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <button
                          type="button"
                          className="flex h-9 items-center justify-center rounded border border-border bg-muted/80 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            setIsAddSampleDialogOpen(false);
                            setPreparedOn(undefined);
                            setAuthorName("Frédéric Dubois");
                            setTemplateSampleId(null);
                            setCopyValues(true);
                            setIsDatePickerOpen(false);
                            setIsAuthorDropdownOpen(false);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isCreatingSample || !preparedOn}
                          className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {isCreatingSample ? "Adding..." : "Add sample"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </form>
            </div>
          </div>
        ) : null}

        {isDeleteConfirmDialogOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsDeleteConfirmDialogOpen(false);
                setSamplesToDelete([]);
              }
            }}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-auto rounded-lg border border-border bg-card shadow-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Confirm deletion</h2>
                <p className="text-sm text-foreground whitespace-pre-line">
                  {samplesToDelete.length === 1
                    ? `Are you sure you want to delete sample ${samplesToDelete[0]?.code ?? samplesToDelete[0]?.sample_id}?\nThis action cannot be undone.`
                    : `Are you sure you want to delete ${samplesToDelete.length} samples?\nThis action cannot be undone.`}
                </p>
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    className="flex h-9 items-center justify-center rounded border border-border bg-muted/80 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setIsDeleteConfirmDialogOpen(false);
                      setSamplesToDelete([]);
                    }}
                    disabled={isDeletingSample}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded border border-border bg-destructive/90 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive active:bg-destructive/80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      if (samplesToDelete.length === 0) {
                        return;
                      }
                      const samples = [...samplesToDelete];
                      const completionRef = { count: 0 };
                      const totalCount = samples.length;

                      const checkCompletion = () => {
                        completionRef.count++;
                        if (completionRef.count === totalCount) {
                          setIsDeleteConfirmDialogOpen(false);
                          setSamplesToDelete([]);
                        }
                      };

                      samples.forEach((sample) => {
                        // Record action for history before deletion
                        recordAction({
                          type: "delete-sample",
                          sampleId: sample.sample_id,
                          sample: sample,
                        });
                        deleteSample(sample.sample_id, {
                          onSuccess: checkCompletion,
                          onError: (err) => {
                            console.error("Failed to delete sample", err);
                            checkCompletion();
                          },
                        });
                      });
                    }}
                    disabled={isDeletingSample}
                  >
                    {isDeletingSample ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

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
              suppressAnimationFrame
              suppressNoRowsOverlay
              stopEditingWhenCellsLoseFocus
              suppressRowClickSelection
              className={`${gridClassName} ${isColumnMenuOpen || isDetailsOverlayOpen || isSettingsOverlayOpen ? "pointer-events-none" : ""}`}
              components={gridComponents}
              theme="legacy"
              tooltipShowDelay={500}
              rowSelection="multiple"
              onGridReady={handleGridReady}
              onFirstDataRendered={handleFirstDataRendered}
              onSelectionChanged={handleSelectionChanged}
              onCellMouseDown={handleCellMouseDown}
              onCellKeyDown={handleCellKeyDown}
              onColumnResized={handleColumnResized}
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

        {/* Custom header popup */}
        {headerPopupState ? (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setHeaderPopupState(null)}
            />
            {/* Popup */}
            <div
              className="fixed z-40 rounded-md border border-border shadow-lg custom-popup-bg"
              style={{
                left: `${headerPopupState.x}px`,
                top: `${headerPopupState.y}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col py-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => handleHideColumn(headerPopupState.colId)}
                >
                  Hide column
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => handleShowDetails(headerPopupState.colId)}
                >
                  Show details
                </button>
              </div>
            </div>
          </>
        ) : null}

        {/* Parameter detail overlay */}
        {parameterDetailOverlay ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-card/90">
            <div
              className="relative max-h-[80vh] max-w-2xl rounded-lg border border-border p-6 shadow-lg custom-popup-bg"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Parameter Details
                </h2>
                <button
                  type="button"
                  className="rounded-md p-1 text-foreground transition-colors hover:bg-muted"
                  onClick={() => setParameterDetailOverlay(null)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="text-sm text-foreground">
                <p>Column ID: {parameterDetailOverlay.colId}</p>
                <p className="mt-2 text-subtle">
                  Detail view will be implemented later.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {isDetailsOverlayOpen && parameterDefinitionMap ? (
          <div className="absolute inset-0 z-20 flex max-w-full flex-col overflow-hidden bg-popover">
            <DetailsOverlay
              gridApi={gridApiRef.current}
              samples={samples}
              parameterDefinitions={parameterDefinitions}
              parameterGroupEntries={parameterGroupEntries as ReadonlyArray<readonly [string, ParameterDefinition[]]>}
              parameterDefinitionMap={parameterDefinitionMap}
              onClose={() => setIsDetailsOverlayOpen(false)}
              onUpdateParameters={commitParameterEdit}
              normalizeParameterValue={normalizeParameterValue}
            />
          </div>
        ) : null}

        {isSettingsOverlayOpen ? (
          <div className="absolute inset-0 z-20 flex max-w-full flex-col overflow-hidden bg-popover">
            <SettingsOverlay
              isOpen={isSettingsOverlayOpen}
              onClose={() => setIsSettingsOverlayOpen(false)}
            />
          </div>
        ) : null}

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
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {(areAllColumnMenuGroupsActive || showCoreColumnsCard || activeColumnMenuGroups.length > 0) ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className="text-xs font-semibold uppercase tracking-wide text-subtle"
                      >
                        Parameter groups
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded-full border-[3px] px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            areAllColumnMenuGroupsActive
                              ? "border-border/80 bg-muted/60 text-foreground hover:bg-muted/70"
                              : "border-border/60 text-foreground opacity-60 hover:opacity-80"
                          }`}
                          onClick={handleToggleAllParameterGroups}
                        >
                          All groups
                        </button>
                        <button
                          type="button"
                          className={`rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            areAllColumnMenuGroupsActive || showCoreColumnsCard
                              ? "border-border bg-muted/50 text-foreground hover:bg-muted/60"
                              : "border-border/60 text-foreground opacity-60 hover:opacity-80"
                          }`}
                          onClick={() => setShowCoreColumnsCard(!showCoreColumnsCard)}
                        >
                          Core columns
                        </button>
                        {parameterGroupEntries.map(([groupName]) => {
                          const isSelected =
                            areAllColumnMenuGroupsActive || activeColumnMenuGroups.includes(groupName);
                          const isDraggable = parameterGroupEntries.length > 1;
                          const isDragging = draggingGroup === groupName;
                          const baseClasses =
                            "rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
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
                    <div className="columns-[14rem] space-y-4 sm:columns-[16rem] lg:columns-[18rem] [column-fill:balance]">
                      {(areAllColumnMenuGroupsActive || showCoreColumnsCard) && (
                        <section className="w-full break-inside-avoid rounded-lg border border-border/60 bg-muted/20 p-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle mb-2">
                            Core columns
                          </h3>
                          <ul className="space-y-1">
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
                      )}
                      {parameterGroupEntries.length === 0 ? (
                        <p className="text-xs text-subtle">
                          No parameter metadata available.
                        </p>
                      ) : !hasVisibleParameterMatches ? (
                        <p className="text-xs text-subtle">
                          No parameters match the current group or name filters.
                        </p>
                      ) : (
                        parameterGroupEntries
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
                                  const fallbackVisible = hasValueByParameter[definition.name] ?? false;
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
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs font-semibold text-subtle">
                      Select one or more parameter groups to display matching parameters.
                    </p>
                  </div>
                )}
              </div>
          </div>
        ) : null}
      </section>

      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <ul className="flex w-full max-w-lg flex-col gap-3">
            {toasts.map((toast) => {
              const isError = toast.variant === "error";
              const toneClasses = isError
                ? "border-[#6A1114] bg-[#6A1114] text-white"
                : "border-border bg-card text-foreground";
              const containerStyle = { 
                "--toast-gap": "12px",
                "--toast-vertical-padding": "12px",
                "--toast-left-padding": "calc(var(--toast-gap) + 14px)" 
              } as CSSProperties;
              return (
                <li key={toast.id} className="pointer-events-auto animate-slide-in-up-bounce">
                  <div
                    role="status"
                    className={`group relative inline-flex items-center rounded-full border shadow-xl ${toneClasses}`}
                    style={{
                      ...containerStyle,
                      paddingLeft: "var(--toast-left-padding)",
                      paddingRight: "var(--toast-gap)",
                      paddingTop: "var(--toast-vertical-padding)",
                      paddingBottom: "var(--toast-vertical-padding)",
                    }}
                    onMouseEnter={() => handleToastMouseEnter(toast)}
                    onMouseLeave={() => handleToastMouseLeave(toast)}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 items-center justify-start overflow-hidden text-left"
                      onClick={(e) => handleToastClick(toast, e)}
                    >
                      <span
                        className="block whitespace-nowrap text-sm font-medium leading-tight tracking-tight text-current"
                      >
                        {toast.summary}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ml-[var(--toast-gap)] inline-flex shrink-0 items-center text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(e) => handleToastClick(toast, e)}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Click for more details</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {activeToastDetail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-12">
          <button
            type="button"
            aria-hidden="true"
            className="absolute inset-0 bg-background/80"
            onClick={closeToastDetail}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="toast-detail-title"
            className="relative inline-flex max-w-[min(90vw,40rem)] flex-col rounded-2xl border border-border bg-card px-6 py-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-3">
              <h2 id="toast-detail-title" className="text-lg font-semibold text-foreground">
                Parameter update failed
              </h2>
              <p className="whitespace-pre-line text-sm text-foreground">
                {activeToastDetailLines ? (
                  <>
                    {activeToastDetailLines[0]}
                    {activeToastDetailLines[1] ? (
                      <>
                        {"\n"}
                        {activeToastDetailLines[1]}
                      </>
                    ) : null}
                  </>
                ) : (
                  activeToastDetail.detail ?? activeToastDetail.summary
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}

    </main>
  );
}
