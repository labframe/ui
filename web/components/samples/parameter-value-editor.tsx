"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ICellEditorComp, ICellEditorParams } from "ag-grid-community";
import { ChevronsUpDown } from "lucide-react";

export interface ParameterValueEditorParams extends ICellEditorParams {
  values?: string[];
}

export const ParameterValueEditor = forwardRef<ICellEditorComp, ParameterValueEditorParams>(
  ({ value, values, stopEditing, eGridCell }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackContainerRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const initialValue = typeof value === "string" ? value : value ?? "";
    const [inputValue, setInputValue] = useState(initialValue);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const latestValueRef = useRef(initialValue.trim());

    useEffect(() => {
      setInputValue(initialValue);
      latestValueRef.current = initialValue.trim();
    }, [initialValue]);

    const optionValues = useMemo(() => {
      if (!values?.length) {
        return [] as string[];
      }
      const unique = new Set<string>();
      for (const entry of values) {
        const normalized = entry.trim();
        if (normalized.length > 0) {
          unique.add(normalized);
        }
      }
      return Array.from(unique).sort((a, b) => a.localeCompare(b));
    }, [values]);

    useImperativeHandle(ref, () => ({
      getGui: () => {
        if (containerRef.current) {
          return containerRef.current;
        }
        if (!fallbackContainerRef.current) {
          fallbackContainerRef.current = document.createElement("div");
        }
        return fallbackContainerRef.current;
      },
      getValue: () => latestValueRef.current,
      afterGuiAttached: () => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      },
      isCancelAfterEnd: () => false,
    }));

    useEffect(() => {
      if (!eGridCell) {
        return;
      }
      const previousOverflow = eGridCell.style.overflow;
      eGridCell.style.overflow = "visible";
      return () => {
        eGridCell.style.overflow = previousOverflow;
      };
    }, [eGridCell]);

    useEffect(() => {
      if (!isOptionsOpen) {
        return;
      }

      const handlePointerDown = (event: MouseEvent) => {
        if (containerRef.current?.contains(event.target as Node)) {
          return;
        }
        setIsOptionsOpen(false);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setIsOptionsOpen(false);
        }
      };

      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [isOptionsOpen]);

    const handleOptionSelect = useCallback(
      (option: string) => {
        setInputValue(option);
        latestValueRef.current = option.trim();
        setIsOptionsOpen(false);

        if (stopEditing) {
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => stopEditing());
          } else {
            stopEditing();
          }
        }
      },
      [stopEditing],
    );

    return (
      <div ref={containerRef} className="relative flex h-full w-full items-stretch gap-2">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            latestValueRef.current = event.target.value.trim();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && optionValues.length > 0) {
              event.preventDefault();
              setIsOptionsOpen(true);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              latestValueRef.current = inputRef.current?.value.trim() ?? "";
              stopEditing?.();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setIsOptionsOpen(false);
              stopEditing?.(true);
            }
          }}
          className="h-full w-full rounded border border-border bg-background px-2 text-sm focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          placeholder="Enter value"
          aria-autocomplete="list"
          onBlur={(event) => {
            latestValueRef.current = event.target.value.trim();
          }}
        />
        {optionValues.length > 0 ? (
          <>
            <button
              type="button"
              className="flex h-full w-9 items-center justify-center rounded border border-border bg-muted text-muted-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsOptionsOpen((previous) => !previous);
              }}
              aria-haspopup="listbox"
              aria-expanded={isOptionsOpen}
            >
              <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Toggle parameter suggestions</span>
            </button>
            {isOptionsOpen ? (
              <ul
                role="listbox"
                className="absolute right-0 top-full z-30 mt-1 w-56 max-h-60 overflow-auto rounded-md border border-border/60 bg-popover py-1 text-sm shadow-lg"
              >
                {optionValues.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      role="option"
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-foreground transition-colors hover:bg-muted/80"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleOptionSelect(option)}
                    >
                      <span>{option}</span>
                      {option === inputValue ? (
                        <span className="text-xs text-muted-foreground">Selected</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    );
  },
);

ParameterValueEditor.displayName = "ParameterValueEditor";
