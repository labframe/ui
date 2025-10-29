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

type ParameterEditSource = "optionSelect" | "keyboard" | "blur";

type ApplyCandidateResult = {
  applied: boolean;
  displayValue?: string;
  reason?: string;
};

export interface ParameterValueEditorParams extends ICellEditorParams {
  values?: string[];
  applyCandidate?: (candidate: string, source: ParameterEditSource) => ApplyCandidateResult;
}

export const ParameterValueEditor = forwardRef<ICellEditorComp, ParameterValueEditorParams>(
  ({ value, values, stopEditing, eGridCell, applyCandidate }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fallbackContainerRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
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

    const initialValue = typeof value === "string" ? value : value ?? "";
    const [inputValue, setInputValue] = useState(initialValue);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const latestValueRef = useRef(initialValue.trim());
    const [dropdownWidth, setDropdownWidth] = useState<number | undefined>(undefined);
    const availableOptions = useMemo(
      () => optionValues.filter((option) => option !== latestValueRef.current),
      [optionValues, inputValue],
    );

    useEffect(() => {
      setInputValue(initialValue);
      latestValueRef.current = initialValue.trim();
    }, [initialValue]);

    const attemptCommit = useCallback(
      (rawValue: string, source: ParameterEditSource): ApplyCandidateResult => {
        const trimmed = rawValue.trim();
        latestValueRef.current = trimmed;

        if (!applyCandidate) {
          return { applied: true, displayValue: trimmed };
        }

        const outcome = applyCandidate(trimmed, source);

        if (outcome.displayValue != null) {
          latestValueRef.current = outcome.displayValue;
          setInputValue(outcome.displayValue);
        }

        return outcome;
      },
      [applyCandidate],
    );

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

    useEffect(() => {
      if (!isOptionsOpen) {
        return;
      }

      const updateWidth = () => {
        if (!containerRef.current) {
          return;
        }
        setDropdownWidth(containerRef.current.getBoundingClientRect().width);
      };

      updateWidth();
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }, [isOptionsOpen]);

    const closeEditor = useCallback(() => {
      if (stopEditing) {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => stopEditing());
        } else {
          stopEditing();
        }
      }
    }, [stopEditing]);

    const handleOptionSelect = useCallback(
      (option: string) => {
        const outcome = attemptCommit(option, "optionSelect");
        if (outcome.applied) {
          setIsOptionsOpen(false);
          closeEditor();
        }
      },
      [attemptCommit, closeEditor],
    );

    return (
      <div ref={containerRef} className="relative flex h-full w-full items-stretch gap-1">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => {
            setInputValue(event.target.value);
            latestValueRef.current = event.target.value.trim();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && availableOptions.length > 0) {
              event.preventDefault();
              setIsOptionsOpen(true);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const outcome = attemptCommit(event.currentTarget.value, "keyboard");
              if (outcome.applied) {
                closeEditor();
              }
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setIsOptionsOpen(false);
              closeEditor();
            }
          }}
          className="h-full w-full rounded border border-border bg-background px-2 text-sm focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          placeholder="Enter value"
          aria-autocomplete="list"
          onBlur={(event) => {
            const outcome = attemptCommit(event.target.value, "blur");
            if (outcome.applied) {
              closeEditor();
            }
          }}
        />
        {availableOptions.length > 0 ? (
          <>
            <button
              type="button"
              className="flex h-full items-center justify-center rounded border border-border bg-muted px-2 text-muted-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                className="absolute left-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-md border border-border/60 bg-popover py-1 text-sm shadow-lg"
                style={{ minWidth: dropdownWidth }}
              >
                {availableOptions.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      role="option"
                      className="flex w-full items-center justify-start gap-2 px-2 py-1.5 text-left text-foreground transition-colors hover:bg-muted/80"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleOptionSelect(option)}
                    >
                      <span>{option}</span>
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
