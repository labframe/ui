"use client";

import { useThemePreference } from "@/components/theme/theme-provider";
import { useSettings } from "./settings-provider";

type AccentColor = "blue" | "green" | "purple" | "orange" | "red" | "pink";
type TextSize = "compact" | "normal" | "comfortable";
type ThemePreference = "system" | "light" | "dark";

const ACCENT_COLORS: { value: AccentColor; label: string; color: string }[] = [
  { value: "blue", label: "Blue", color: "hsl(210, 100%, 50%)" },
  { value: "green", label: "Green", color: "hsl(142, 76%, 36%)" },
  { value: "purple", label: "Purple", color: "hsl(270, 91%, 65%)" },
  { value: "orange", label: "Orange", color: "hsl(25, 95%, 53%)" },
  { value: "red", label: "Red", color: "hsl(0, 84%, 60%)" },
  { value: "pink", label: "Pink", color: "hsl(330, 81%, 60%)" },
];

const TEXT_SIZES: { value: TextSize; label: string; description: string }[] = [
  { value: "compact", label: "Compact", description: "Denser spacing, smaller text" },
  { value: "normal", label: "Normal", description: "Default spacing and text size" },
  { value: "comfortable", label: "Comfortable", description: "More spacing, larger text" },
];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface SettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsOverlay({ isOpen, onClose }: SettingsOverlayProps) {
  const { preference, setPreference } = useThemePreference();
  const { accentColor, textSize, setAccentColor, setTextSize } = useSettings();

  if (!isOpen) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close settings"
        >
          Done
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 py-4 min-h-0">
        <div className="space-y-8">
          {/* Theme Section */}
          <section>
            <h3 className="mb-3 text-lg font-medium">Theme</h3>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((option) => {
                const isActive = option.value === preference;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreference(option.value)}
                    className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Accent Color Section */}
          <section>
            <h3 className="mb-3 text-lg font-medium">Accent Color</h3>
            <div className="flex flex-wrap gap-3">
              {ACCENT_COLORS.map((colorOption) => {
                const isActive = colorOption.value === accentColor;
                return (
                  <button
                    key={colorOption.value}
                    type="button"
                    onClick={() => setAccentColor(colorOption.value)}
                    className={`group flex flex-col items-center gap-2 rounded-md border-2 p-3 transition-all ${
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/50 hover:bg-muted"
                    }`}
                    aria-label={`Select ${colorOption.label} accent color`}
                  >
                    <div
                      className="h-8 w-8 rounded-full border-2 border-current transition-transform group-hover:scale-110"
                      style={{ backgroundColor: colorOption.color }}
                    />
                    <span className="text-xs font-medium">{colorOption.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Text Size Section */}
          <section>
            <h3 className="mb-3 text-lg font-medium">Text Size</h3>
            <div className="space-y-2">
              {TEXT_SIZES.map((sizeOption) => {
                const isActive = sizeOption.value === textSize;
                return (
                  <button
                    key={sizeOption.value}
                    type="button"
                    onClick={() => setTextSize(sizeOption.value)}
                    className={`w-full rounded-md border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <div className="font-medium">{sizeOption.label}</div>
                    <div className="text-xs opacity-80">{sizeOption.description}</div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


