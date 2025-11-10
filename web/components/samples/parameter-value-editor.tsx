"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ICellEditorComp, ICellEditorParams } from "ag-grid-community";

type ParameterEditSource = "optionSelect" | "keyboard" | "blur";

type ApplyCandidateResult = {
  applied: boolean;
  displayValue?: string;
  reason?: string;
};

export interface ParameterValueEditorParams extends ICellEditorParams {
  values?: string[];
  applyCandidate?: (candidate: string, source: ParameterEditSource) => ApplyCandidateResult;
  textAlign?: "left" | "right";
  useTabularNumbers?: boolean;
}

export const CELL_HORIZONTAL_PADDING_PX = 14;
const INPUT_HORIZONTAL_INSET_PX = CELL_HORIZONTAL_PADDING_PX;
const INPUT_LEFT_PADDING_PX = Math.max(CELL_HORIZONTAL_PADDING_PX - 1, 0);
const DROPDOWN_TEXT_OFFSET_PX = 1;

const naturalStringCollator = typeof Intl !== "undefined" ? new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }) : null;

export function sortParameterValues(values: string[]): string[] {
  if (!values.length) {
    return [];
  }
  if (naturalStringCollator) {
    return [...values].sort((a, b) => naturalStringCollator.compare(a, b));
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

export const ParameterValueEditor = forwardRef<ICellEditorComp, ParameterValueEditorParams>(
  ({ value, values, stopEditing, applyCandidate, textAlign = "left", useTabularNumbers = false }, ref) => {
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
      return sortParameterValues(Array.from(unique));
    }, [values]);

    const initialValue = typeof value === "string" ? value : value ?? "";
    const [inputValue, setInputValue] = useState(initialValue);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const latestValueRef = useRef(initialValue.trim());
    const [dropdownWidth, setDropdownWidth] = useState<number | undefined>(undefined);
    const trimmedInputValue = inputValue.trim();
    const availableOptions = useMemo(
      () => optionValues.filter((option) => option !== trimmedInputValue),
      [optionValues, trimmedInputValue],
    );
    const openOptions = useCallback(() => {
      setIsOptionsOpen(true);
    }, []);

    const syncInitialValue = useEffectEvent((nextValue: string) => {
      setInputValue(nextValue);
      latestValueRef.current = nextValue.trim();
    });

    useEffect(() => {
      syncInitialValue(initialValue);
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

    useImperativeHandle(
      ref,
      () => ({
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
            const length = inputRef.current.value.length;
            inputRef.current.setSelectionRange(length, length);
          }
        },
        isCancelAfterEnd: () => false,
        openOptions,
      }) as ICellEditorComp & { openOptions: () => void },
    );

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
        const { width } = containerRef.current.getBoundingClientRect();
        const totalWidth = Math.max(0, width + INPUT_HORIZONTAL_INSET_PX + CELL_HORIZONTAL_PADDING_PX);
        setDropdownWidth(totalWidth);
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
      <div
        ref={containerRef}
        className="relative flex h-full w-full items-stretch"
      >
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
              event.stopPropagation();
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
          className={`h-full w-full rounded-none border-0 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-0 focus-visible:border-0 ${
            textAlign === "right" ? `text-right ${useTabularNumbers ? "tabular-nums" : ""}`.trim() : "text-left"
          }`}
          placeholder="Enter value"
          aria-autocomplete="list"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            paddingLeft: `${CELL_HORIZONTAL_PADDING_PX}px`,
            paddingRight: `${CELL_HORIZONTAL_PADDING_PX}px`,
          }}
          onBlur={(event) => {
            const outcome = attemptCommit(event.target.value, "blur");
            if (outcome.applied) {
              closeEditor();
            }
          }}
        />
        {isOptionsOpen && availableOptions.length > 0 ? (
              <ul
                role="listbox"
                className="absolute left-0 top-full z-30 mt-2 max-h-60 overflow-auto rounded-md border border-border/60 bg-background py-1 text-sm shadow-lg"
                style={{
                  left: `-${INPUT_HORIZONTAL_INSET_PX}px`,
                  width: dropdownWidth,
                }}
              >
                {availableOptions.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex w-full items-center justify-start gap-2 py-1.5 text-left text-foreground transition-colors hover:bg-muted/80"
                      style={{
                        paddingLeft: `${CELL_HORIZONTAL_PADDING_PX + DROPDOWN_TEXT_OFFSET_PX}px`,
                        paddingRight: `${CELL_HORIZONTAL_PADDING_PX}px`,
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleOptionSelect(option)}
                    >
                      <span>{option}</span>
                    </button>
                  </li>
                ))}
              </ul>
        ) : null}
      </div>
    );
  },
);

ParameterValueEditor.displayName = "ParameterValueEditor";
