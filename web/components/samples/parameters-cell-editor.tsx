"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ICellEditorParams } from "ag-grid-community";

interface ParameterOption {
  name: string;
  group: string;
}

interface ParametersCellEditorProps
  extends ICellEditorParams<Record<string, string>, Record<string, string>> {
  parameterOptions?: ParameterOption[];
}

interface ParameterRow {
  id: number;
  name: string;
  value: string;
  isCustom: boolean;
}

const CUSTOM_OPTION_VALUE = "__custom__";

export const ParametersCellEditor = forwardRef(function ParametersCellEditor(
  props: ParametersCellEditorProps,
  ref,
) {
  const options = useMemo(() => props.parameterOptions ?? [], [props.parameterOptions]);
  const optionNames = useMemo(() => options.map((option) => option.name), [options]);

  const initialRows = useMemo<ParameterRow[]>(() => {
    const source = props.value ?? props.data?.parameters ?? {};
    const entries = Object.entries(source ?? {});

    if (entries.length === 0) {
      return [createEmptyRow(optionNames)];
    }

    return entries.map(([name, value], index) => ({
      id: index + 1,
      name,
      value: value ?? "",
      isCustom: !optionNames.includes(name),
    }));
  }, [optionNames, props.data?.parameters, props.value]);

  const [rows, setRows] = useState<ParameterRow[]>(() => initialRows);
  const nextId = useRef(initialRows.length + 1);
  const firstInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => rowsToRecord(rows),
    afterGuiAttached: () => {
      firstInputRef.current?.focus();
    },
  }));

  const handleSelectChange = useCallback(
    (row: ParameterRow, value: string) => {
      setRows((current) =>
        current.map((entry) => {
          if (entry.id !== row.id) {
            return entry;
          }

          if (value === CUSTOM_OPTION_VALUE) {
            return { ...entry, name: "", isCustom: true };
          }

          return { ...entry, name: value, isCustom: false };
        }),
      );
    },
    [],
  );

  const handleNameChange = useCallback((row: ParameterRow, value: string) => {
    setRows((current) =>
      current.map((entry) =>
        entry.id === row.id ? { ...entry, name: value, isCustom: true } : entry,
      ),
    );
  }, []);

  const handleValueChange = useCallback((row: ParameterRow, value: string) => {
    setRows((current) =>
      current.map((entry) =>
        entry.id === row.id ? { ...entry, value } : entry,
      ),
    );
  }, []);

  const handleAddRow = useCallback(() => {
    setRows((current) => [
      ...current,
      {
        id: nextId.current++,
        name: "",
        value: "",
        isCustom: true,
      },
    ]);
  }, []);

  const handleRemoveRow = useCallback((row: ParameterRow) => {
    setRows((current) => current.filter((entry) => entry.id !== row.id));
  }, []);

  const nameInputPlaceholder = options.length > 0 ? "Select or type a name" : "Parameter name";

  return (
    <div className="flex min-h-[280px] flex-col gap-3 rounded-md bg-card p-3 text-sm text-foreground">
      <div className="flex items-center justify-between">
        <span className="font-medium">Parameter assignments</span>
        <button
          type="button"
          className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm transition hover:bg-accent hover:text-accent-foreground"
          onClick={handleAddRow}
        >
          + Add parameter
        </button>
      </div>
      <div className="flex flex-col gap-2 overflow-auto pr-1">
        {rows.map((row, index) => {
          const rowIsCustom = row.isCustom || !optionNames.includes(row.name);

          return (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                {rowIsCustom ? (
                  <input
                    ref={index === 0 ? (node) => {
                      firstInputRef.current = node;
                    } : null}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
                    placeholder={nameInputPlaceholder}
                    value={row.name}
                    onChange={(event) => handleNameChange(row, event.target.value)}
                  />
                ) : (
                  <select
                    ref={index === 0 ? (node) => {
                      firstInputRef.current = node;
                    } : null}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
                    value={row.name}
                    onChange={(event) => handleSelectChange(row, event.target.value)}
                  >
                    <option value="">Select parameter…</option>
                    {options.map((option) => (
                      <option key={option.name} value={option.name}>
                        {option.group} · {option.name}
                      </option>
                    ))}
                    <option value={CUSTOM_OPTION_VALUE}>Custom name…</option>
                  </select>
                )}
                {rowIsCustom && options.length > 0 ? (
                  <button
                    type="button"
                    className="self-start text-xs text-primary hover:underline"
                    onClick={() => handleSelectChange(row, options[0]?.name ?? "")}
                  >
                    Use catalog name
                  </button>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Value</label>
                <input
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30"
                  placeholder="Value"
                  value={row.value}
                  onChange={(event) => handleValueChange(row, event.target.value)}
                />
              </div>
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive transition hover:bg-destructive/20"
                  onClick={() => handleRemoveRow(row)}
                  disabled={rows.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Saving will persist names and values exactly as displayed.
      </p>
      <p className="text-xs text-muted-foreground">
        Known parameters are grouped by catalog category. Choose &quot;Custom name…&quot; to enter manual keys.
      </p>
    </div>
  );
});

function createEmptyRow(optionNames: string[]): ParameterRow {
  const firstOption = optionNames[0] ?? "";
  if (firstOption) {
    return { id: 0, name: firstOption, value: "", isCustom: false };
  }
  return { id: 0, name: "", value: "", isCustom: true };
}

function rowsToRecord(rows: ParameterRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const trimmedName = row.name.trim();
    if (!trimmedName) {
      continue;
    }
    result[trimmedName] = row.value.trim();
  }
  return result;
}
