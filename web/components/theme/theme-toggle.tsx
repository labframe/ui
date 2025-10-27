"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { useThemePreference } from "./theme-provider";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

type OptionValue = (typeof OPTIONS)[number]["value"];

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex h-9 items-center gap-1 rounded border border-border bg-muted px-3 py-2 text-sm font-medium"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((previous) => !previous)}
      >
        Theme
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {isOpen ? (
        <ul
          role="listbox"
          className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-md border border-border bg-card shadow-lg"
        >
          {OPTIONS.map((option) => {
            const isActive = option.value === preference;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isActive}
                className={isActive ? "bg-muted" : "hover:bg-muted/60"}
              >
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                    isActive ? "font-medium" : ""
                  }`}
                  onClick={() => {
                    setPreference(option.value as OptionValue);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
