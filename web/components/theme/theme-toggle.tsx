"use client";

import { useThemePreference } from "./theme-provider";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

type OptionValue = (typeof OPTIONS)[number]["value"];

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <span>Theme</span>
      <select
        className="rounded border border-border bg-muted px-2 py-1 text-sm"
        value={preference}
        onChange={(event) => setPreference(event.target.value as OptionValue)}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
