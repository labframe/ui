"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AccentColor = "blue" | "green" | "purple" | "orange" | "red" | "pink";
type TextSize = "compact" | "normal" | "comfortable";

interface SettingsContextValue {
  accentColor: AccentColor;
  textSize: TextSize;
  setAccentColor: (color: AccentColor) => void;
  setTextSize: (size: TextSize) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const ACCENT_COLOR_STORAGE_KEY = "labframe-ui-accent-color";
const TEXT_SIZE_STORAGE_KEY = "labframe-ui-text-size";

function readStoredAccentColor(): AccentColor {
  if (typeof window === "undefined") {
    return "blue";
  }
  const stored = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY) as AccentColor | null;
  if (stored === "blue" || stored === "green" || stored === "purple" || stored === "orange" || stored === "red" || stored === "pink") {
    return stored;
  }
  return "blue";
}

function readStoredTextSize(): TextSize {
  if (typeof window === "undefined") {
    return "normal";
  }
  const stored = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY) as TextSize | null;
  if (stored === "compact" || stored === "normal" || stored === "comfortable") {
    return stored;
  }
  return "normal";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [accentColor, setAccentColorState] = useState<AccentColor>(() => readStoredAccentColor());
  const [textSize, setTextSizeState] = useState<TextSize>(() => readStoredTextSize());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACCENT_COLOR_STORAGE_KEY) {
        setAccentColorState(readStoredAccentColor());
      } else if (event.key === TEXT_SIZE_STORAGE_KEY) {
        setTextSizeState(readStoredTextSize());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, accentColor);
    
    // Apply accent color via CSS custom property
    const root = document.documentElement;
    const accentColors: Record<AccentColor, string> = {
      blue: "210 100% 50%",
      green: "142 76% 36%",
      purple: "270 91% 65%",
      orange: "25 95% 53%",
      red: "0 84% 60%",
      pink: "330 81% 60%",
    };
    root.style.setProperty("--accent-hsl", accentColors[accentColor]);
  }, [accentColor]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSize);
    
    // Apply text size via CSS class
    const root = document.documentElement;
    root.classList.remove("text-size-compact", "text-size-normal", "text-size-comfortable");
    root.classList.add(`text-size-${textSize}`);
  }, [textSize]);

  const setAccentColorSafe = useCallback((next: AccentColor) => {
    setAccentColorState(next);
  }, []);

  const setTextSizeSafe = useCallback((next: TextSize) => {
    setTextSizeState(next);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ accentColor, textSize, setAccentColor: setAccentColorSafe, setTextSize: setTextSizeSafe }),
    [accentColor, textSize, setAccentColorSafe, setTextSizeSafe],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}











